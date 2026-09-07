import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { analyzeGeneratedConsumers } from './frontend-impact.mjs';

const normalize = (value) => value.replaceAll('\\', '/');

function readGitObjects(root, references) {
  if (!references.length) return [];
  if (references.some((reference) => /[\r\n]/.test(reference))) throw new Error('Git paths contain unsupported line separators');
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: root, input: references.join('\n') + '\n', maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('Git could not read the generated-client comparison');
  let offset = 0;
  return references.map(() => {
    const end = result.stdout.indexOf(10, offset);
    if (end < 0) throw new Error('Incomplete Git object response');
    const header = result.stdout.subarray(offset, end).toString('utf8');
    offset = end + 1;
    if (header.endsWith(' missing')) return null;
    const match = /^[0-9a-f]+ blob (\d+)$/.exec(header);
    if (!match) throw new Error('Unexpected Git object in generated-client comparison');
    const size = Number(match[1]);
    const text = result.stdout.subarray(offset, offset + size).toString('utf8');
    offset += size + 1;
    return text;
  });
}

function run(request) {
  const { workspace, packageRoot, changedPaths, before, after } = request;
  const require = createRequire(path.join(packageRoot, 'package.json'));
  const ts = require('typescript');
  const files = {};
  function walk(directory, allowed) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && !['node_modules', 'dist', 'coverage'].includes(entry.name)) walk(file, allowed);
      else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)
          && (!allowed || allowed.has(normalize(file)) || /\.test\.[cm]?[jt]sx?$/.test(entry.name)))
        files[normalize(path.relative(packageRoot, file))] = readFileSync(file, 'utf8');
    }
  }
  const projects = [];
  for (const projectRoot of request.packageRoots ?? [packageRoot]) {
    const configPath = path.join(projectRoot, 'tsconfig.json');
    let compilerOptions = {};
    let allowed;
    if (existsSync(configPath)) {
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      if (config.error) throw new Error('Cannot read TypeScript paths for generated-client consumers');
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, projectRoot);
      if (parsed.errors.some((error) => error.code !== 18003)) throw new Error(`Invalid TypeScript configuration: ${configPath}`);
      compilerOptions = parsed.options;
      allowed = new Set(parsed.fileNames.map(normalize));
      for (const file of parsed.fileNames)
        if (/\.[cm]?[jt]sx?$/.test(file) && !normalize(file).includes('/node_modules/')
            && normalize(file).startsWith(normalize(workspace) + '/'))
          files[normalize(path.relative(packageRoot, file))] = readFileSync(file, 'utf8');
    }
    for (const directory of ['src', 'app', 'test', 'tests']) walk(path.join(projectRoot, directory), allowed);
    projects.push({ root: projectRoot, compilerOptions });
  }
  // TypeScript compilation roots can import files outside include globs (for example a tested server helper).
  // Close those actual imports without pulling excluded prototypes or every file in neighboring products in.
  const pending = Object.keys(files);
  const orderedProjects = [...projects].sort((left, right) => right.root.length - left.root.length);
  for (let index = 0; index < pending.length; index++) {
    const relative = pending[index];
    const from = path.resolve(packageRoot, relative);
    const project = orderedProjects.find((item) => normalize(from).startsWith(normalize(item.root) + '/'));
    const options = { allowJs: true, moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: project?.root ?? packageRoot, ...project?.compilerOptions };
    for (const imported of ts.preProcessFile(files[relative], true, true).importedFiles) {
      const resolved = ts.resolveModuleName(imported.fileName, from, options, ts.sys).resolvedModule;
      if (!resolved) continue;
      const file = normalize(resolved.resolvedFileName);
      if (!file.startsWith(normalize(workspace) + '/') || file.includes('/node_modules/')) continue;
      const key = normalize(path.relative(packageRoot, file));
      if (Object.hasOwn(files, key)) continue;
      files[key] = readFileSync(file, 'utf8');
      pending.push(key);
    }
  }
  const old = readGitObjects(workspace, changedPaths.map((file) => `${before}:${file}`));
  const next = after === null ? null : readGitObjects(workspace,
    changedPaths.map((file) => after === ':' ? `:${file}` : `${after}:${file}`));
  const changes = changedPaths.map((file, index) => {
    const relative = normalize(path.relative(packageRoot, path.join(workspace, file)));
    return { path: relative, before: old[index], after: next ? next[index] : files[relative] ?? null };
  });
  return analyzeGeneratedConsumers(ts, { root: packageRoot, files, changes, projects });
}

try {
  process.stdout.write(JSON.stringify(run(JSON.parse(readFileSync(0, 'utf8')))));
} catch (error) {
  process.stdout.write(JSON.stringify({ reliable: false, reason: error.message }));
}
