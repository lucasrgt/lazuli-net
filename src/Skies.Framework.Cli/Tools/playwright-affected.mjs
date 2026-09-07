import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { selectPlaywrightCases } from './playwright-selection.mjs';

let scratch;
try {
  const flows = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const bin = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
  const environment = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };
  const capture = (args) => spawnSync(process.execPath, [bin, 'test', ...args], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: environment,
  });
  const help = capture(['--help']);
  if (help.status !== 0 || !help.stdout.includes('--test-list'))
    throw new Error('Affected case selection requires a pinned Playwright supporting --test-list');
  const specs = [...new Set(flows.map((flow) => flow.spec))];
  const inventory = capture([...specs, '--list', '--reporter=list']);
  if (inventory.status !== 0) {
    process.stderr.write(inventory.stderr ?? '');
    throw new Error('Playwright could not collect the affected cases');
  }
  const selected = selectPlaywrightCases(inventory.stdout, flows);
  if (!selected.length) throw new Error('The affected browser closure collected no cases');
  scratch = mkdtempSync(path.join(tmpdir(), 'skies-playwright-'));
  const list = path.join(scratch, 'affected.txt');
  writeFileSync(list, selected.join('\n') + '\n');
  process.stdout.write(`skies gate — Playwright: ${selected.length} selected case(s), one runner, one worker\n`);
  const result = spawnSync(process.execPath, [bin, 'test', '--test-list', list, '--workers=1'], {
    stdio: 'inherit', env: environment,
  });
  process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(`skies gate — Playwright selection: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}
