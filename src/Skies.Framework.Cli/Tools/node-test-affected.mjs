import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Native Node tests take runner options before file names. Appending Vitest filters to an npm script neither
// replaces its original files nor limits their concurrency, so run the selected native argv directly.
let scratch;
try {
  const [scriptName, encodedPaths] = process.argv.slice(2);
  const script = JSON.parse(readFileSync('package.json', 'utf8')).scripts[scriptName];
  const tokens = script.match(/"(?:\\"|[^"])*"|'[^']*'|[^\s]+/g) ?? [];
  const args = tokens.map((token) => /^['"]/.test(token) ? token.slice(1, -1).replaceAll('\\"', '"') : token);
  if (args.shift() !== 'node' || !args.includes('--test') || args.some((arg) => ['&&', '||', '|', ';', '>', '<'].includes(arg)))
    throw new Error('Native Node unit tests require a direct node --test script');
  const valueFlags = new Set(['--import', '--require', '-r', '--loader', '--experimental-loader', '--conditions',
    '--test-reporter', '--test-reporter-destination', '--test-timeout', '--test-name-pattern', '--test-skip-pattern']);
  const options = [];
  const declaredPaths = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--test-reporter' || arg === '--test-reporter-destination') { index++; continue; }
    if (arg.startsWith('--test-reporter=') || arg.startsWith('--test-reporter-destination=')) continue;
    if (arg === '--test-concurrency') { index++; continue; }
    if (arg.startsWith('--test-concurrency=')) continue;
    if (arg.startsWith('-')) {
      options.push(arg);
      if (valueFlags.has(arg)) {
        if (++index >= args.length) throw new Error(`Missing value for ${arg}`);
        options.push(args[index]);
      }
    } else declaredPaths.push(arg);
  }
  const selected = JSON.parse(encodedPaths);
  const files = selected ?? declaredPaths;
  scratch = mkdtempSync(path.join(tmpdir(), 'skies-node-evidence-'));
  const receipt = path.join(scratch, 'results.xml');
  process.stdout.write(`skies gate — native Node tests: ${selected ? selected.length + ' selected file(s)' : 'full script'}, two workers\n`);
  const result = spawnSync(process.execPath, [...options, '--test-concurrency=2',
    '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=junit', `--test-reporter-destination=${receipt}`, ...files], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
  if (result.status === 0) {
    const evidence = readFileSync(receipt, 'utf8');
    if (!evidence.trimEnd().endsWith('</testsuites>') || !/<testcase(?:\s|>)/.test(evidence))
      throw new Error('The native runner produced no executable test evidence');
    if (/<skipped(?:\s|\/|>)/.test(evidence)) throw new Error('The native runner skipped selected tests');
  }
} catch (error) {
  process.stderr.write(`skies gate — native Node test selection: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}
