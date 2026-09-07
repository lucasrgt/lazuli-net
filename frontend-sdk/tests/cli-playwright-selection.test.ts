import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { selectPlaywrightCases } from '../../src/Skies.Framework.Cli/Tools/playwright-selection.mjs';

it('selects an exact case once without borrowing unrelated cases from the same spec', () => {
  const list = `Listing tests:
  [chromium] › account.spec.ts:10:1 › account › Login happy
  [chromium] › account.spec.ts:20:1 › account › Reset happy
  [chromium] › other.spec.ts:10:1 › account › Login happy
Total: 3 tests in 2 files`;
  const flow = { id: 'login', spec: 'e2e/account.spec.ts', case: 'Login happy' };
  expect(selectPlaywrightCases(list, [flow, { ...flow, id: 'duplicate-binding' }]))
    .toEqual(['[chromium] › account.spec.ts:10:1 › account › Login happy']);
});

it('keeps every configured browser project and accepts Windows inventory paths', () => {
  const list = `  [chromium] › e2e\\login.spec.ts:10:1 › Login happy
  [firefox] › e2e/login.spec.ts:10:1 › Login happy`;
  expect(selectPlaywrightCases(list, [{ id: 'login', spec: 'e2e/login.spec.ts', case: 'Login happy' }])).toHaveLength(2);
});

it('rejects a leaf title shared by different suites and accepts its complete title path', () => {
  const list = `  [chromium] › login.spec.ts:10:1 › account › happy
  [chromium] › login.spec.ts:20:1 › admin › happy`;
  const flow = { id: 'login', spec: 'e2e/login.spec.ts', case: 'happy' };
  expect(() => selectPlaywrightCases(list, [flow])).toThrow('ambiguous');
  expect(selectPlaywrightCases(list, [{ ...flow, case: 'account › happy' }]))
    .toEqual(['[chromium] › login.spec.ts:10:1 › account › happy']);
});

it('fails when any selected case is missing instead of widening or accepting a partial execution', () => {
  expect(() => selectPlaywrightCases('  [chromium] › login.spec.ts:10:1 › Login happy', [
    { id: 'login', spec: 'e2e/login.spec.ts', case: 'Login happy' },
    { id: 'sad', spec: 'e2e/login.spec.ts', case: 'Login sad' },
  ])).toThrow('was not collected');
});

it('drives the real Playwright runner once and leaves an unrelated failing case unexecuted', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'skies-playwright-selection-test-'));
  try {
    writeFileSync(path.join(root, 'package.json'), '{}');
    writeFileSync(path.join(root, 'playwright.config.cjs'), "module.exports = { testDir: '.', reporter: 'line' };\n");
    writeFileSync(path.join(root, 'smoke.spec.js'), `
      const { test } = require('@playwright/test');
      const fs = require('node:fs');
      test('changed', () => fs.appendFileSync('executed.txt', 'changed\\n'));
      test('unrelated', () => { throw new Error('an unselected case must never execute'); });
    `);
    const flow = { id: 'changed', spec: 'smoke.spec.js', case: 'changed' };
    const selection = path.join(root, 'flows.json');
    writeFileSync(selection, JSON.stringify([flow, { ...flow, id: 'same-case-second-binding' }]));
    const script = path.resolve(process.cwd(), '../src/Skies.Framework.Cli/Tools/playwright-affected.mjs');
    const modules = path.join(process.cwd(), 'node_modules');
    const result = spawnSync(process.execPath, [script, selection], {
      cwd: root, encoding: 'utf8', timeout: 25_000,
      env: { ...process.env, NODE_PATH: modules, CI: 'true', SKY_GATE: '1' },
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(readFileSync(path.join(root, 'executed.txt'), 'utf8')).toBe('changed\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
