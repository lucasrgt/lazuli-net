import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

it.each(['empty', 'skipped'])('does not accept %s native test evidence', (mode) => {
  const root = mkdtempSync(path.join(tmpdir(), 'skies-native-node-evidence-'));
  try {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
    if (mode === 'skipped') writeFileSync(path.join(root, 'skip.test.mjs'), "import { test } from 'node:test'; test.skip('missing proof', () => {});");
    const helper = path.resolve(process.cwd(), '../src/Skies.Framework.Cli/Tools/node-test-affected.mjs');
    const result = spawnSync(process.execPath, [helper, 'test', 'null'], { cwd: root, encoding: 'utf8', timeout: 10_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(mode === 'empty' ? 'no executable test evidence' : 'skipped selected tests');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('replaces a native Node script full file list with the affected files', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'skies-native-node-tests-'));
  try {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: {
      'test:unit': 'node --experimental-strip-types --test selected.test.mjs unrelated.test.mjs',
    } }));
    writeFileSync(path.join(root, 'selected.test.mjs'), `
      import { test } from 'node:test';
      import { appendFileSync } from 'node:fs';
      test('selected', () => appendFileSync('executed.txt', 'selected\\n'));
    `);
    writeFileSync(path.join(root, 'unrelated.test.mjs'), `
      import { test } from 'node:test';
      test('unrelated', () => { throw new Error('unselected test executed'); });
    `);
    const helper = path.resolve(process.cwd(), '../src/Skies.Framework.Cli/Tools/node-test-affected.mjs');
    const selected = spawnSync(process.execPath, [helper, 'test:unit', JSON.stringify(['selected.test.mjs'])], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
    });
    expect(selected.status, selected.stdout + selected.stderr).toBe(0);
    expect(readFileSync(path.join(root, 'executed.txt'), 'utf8')).toBe('selected\n');
    const full = spawnSync(process.execPath, [helper, 'test:unit', 'null'], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
    });
    expect(full.status).toBe(1);
    expect(full.stdout + full.stderr).toContain('unselected test executed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
