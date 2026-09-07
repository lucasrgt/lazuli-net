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
  function walk(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && !['node_modules', 'dist', 'coverage'].includes(entry.name)) walk(file);
      else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name))
        files[normalize(path.relative(packageRoot, file))] = readFileSync(file, 'utf8');
    }
  }
  walk(path.join(packageRoot, 'src'));
  const old = readGitObjects(workspace, changedPaths.map((file) => `${before}:${file}`));
  const next = after === null ? null : readGitObjects(workspace,
    changedPaths.map((file) => after === ':' ? `:${file}` : `${after}:${file}`));
  const changes = changedPaths.map((file, index) => {
    const relative = normalize(path.relative(packageRoot, path.join(workspace, file)));
    return { path: relative, before: old[index], after: next ? next[index] : files[relative] ?? null };
  });
  const configPath = path.join(packageRoot, 'tsconfig.json');
  let compilerOptions = {};
  if (existsSync(configPath)) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error) throw new Error('Cannot read TypeScript paths for generated-client consumers');
    compilerOptions = ts.parseJsonConfigFileContent(config.config, ts.sys, packageRoot).options;
  }
  return analyzeGeneratedConsumers(ts, { root: packageRoot, files, changes, compilerOptions });
}

try {
  process.stdout.write(JSON.stringify(run(JSON.parse(readFileSync(0, 'utf8')))));
} catch (error) {
  process.stdout.write(JSON.stringify({ reliable: false, reason: error.message }));
}
