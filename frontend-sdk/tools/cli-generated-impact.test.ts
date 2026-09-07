import { describe, expect, it } from 'vitest';
import ts from 'typescript';
// The helper ships inside the .NET tool; exercise it with the same project-owned TypeScript parser it loads there.
import { analyzeGeneratedConsumers } from '../../src/Skies.Framework.Cli/Tools/frontend-impact.mjs';

function analyze(files: Record<string, string>, path: string, before: string | null) {
  return analyzeGeneratedConsumers(ts, { root: '/workspace', files,
    changes: [{ path, before, after: files[path] ?? null }] });
}

describe('the CLI generated-client impact graph', () => {
  it('keeps runtime validators and literal dynamic imports in the affected closure', () => {
    const before = 'export const parseAmount = (value: unknown) => Number(value);';
    const files = {
      'src/client.gen/validator.ts': before.replace('Number(value)', 'Math.max(0, Number(value))'),
      'src/features/wallet/Wallet.viewModel.ts': "export const useWallet = async () => (await import('@/client.gen/validator')).parseAmount(2);",
    };
    expect(analyze(files, 'src/client.gen/validator.ts', before).files).toEqual(['src/features/wallet/Wallet.viewModel.ts']);
  });

  it('does not send an added error code through every hook that only names the error type', () => {
    const files = {
      'src/client.gen/model/code.ts': "export const Code = { denied: 'denied', invalid: 'invalid' } as const; export type Code = typeof Code[keyof typeof Code];",
      'src/client.gen/model/error.ts': "import type { Code } from './code'; export interface ErrorBody { code: Code; }",
      'src/client.gen/api.ts': "import type { ErrorBody } from './model/error'; export const useLogin = <TError = ErrorBody>() => 1;",
      'src/features/login/Login.viewModel.ts': "import { useLogin } from '@/client.gen/api'; export const useSignIn = () => useLogin();",
      'src/lib/error.test.ts': "import { Code } from '@/client.gen/model/code'; test('codes', () => expect(Object.keys(Code)).toContain('denied'));",
    };
    expect(analyze(files, 'src/client.gen/model/code.ts', "export const Code = { denied: 'denied' } as const; export type Code = typeof Code[keyof typeof Code];").files)
      .toEqual(['src/lib/error.test.ts']);
  });

  it('selects only the consumer of a changed operation in a monolithic API file', () => {
    const before = 'export const useWithdraw = () => 1; export const useLogin = () => 2;';
    const files = {
      'src/client.gen/api.ts': before.replace('=> 1', '=> 3'),
      'src/features/wallet/Wallet.viewModel.ts': "import { useWithdraw as withdraw } from '@/client.gen/api'; export const useWallet = () => withdraw();",
      'src/features/login/Login.viewModel.ts': "import { useLogin } from '@/client.gen/api'; export const useSignIn = () => useLogin();",
    };
    expect(analyze(files, 'src/client.gen/api.ts', before).files).toEqual(['src/features/wallet/Wallet.viewModel.ts']);
  });

  it('leaves erased schema changes to the universal typecheck instead of running unchanged runtime consumers', () => {
    const files = {
      'src/client.gen/model/wallet.ts': 'export interface WalletInput { amount: number; memo: string; }',
      'src/client.gen/model/login.ts': 'export interface LoginInput { email: string; }',
      'src/client.gen/model/index.ts': "export * from './wallet'; export * from './login';",
      'src/client.gen/api.ts': "import type { WalletInput, LoginInput } from './model'; const withdraw = (input: WalletInput) => input; export const useWithdraw = () => withdraw; export const useLogin = (input: LoginInput) => input;",
      'src/features/wallet/Wallet.viewModel.ts': "import { useWithdraw } from '@/client.gen/api'; export const useWallet = () => useWithdraw();",
      'src/features/login/Login.viewModel.ts': "import { useLogin } from '@/client.gen/api'; export const useSignIn = () => useLogin({email:'a'});",
    };
    expect(analyze(files, 'src/client.gen/model/wallet.ts', 'export interface WalletInput { amount: number; }').files)
      .toEqual([]);
  });

  it('selects every actual consumer when shared generated behavior changes', () => {
    const before = 'const send = () => 1; export const useWithdraw = () => send(); export const useLogin = () => send();';
    const files = {
      'src/client.gen/api.ts': before.replace('=> 1', '=> 2'),
      'src/features/wallet/Wallet.viewModel.ts': "import { useWithdraw } from '@/client.gen/api'; export const useWallet = () => useWithdraw();",
      'src/features/login/Login.viewModel.ts': "import { useLogin } from '@/client.gen/api'; export const useSignIn = () => useLogin();",
    };
    expect(analyze(files, 'src/client.gen/api.ts', before).files)
      .toEqual(['src/features/login/Login.viewModel.ts', 'src/features/wallet/Wallet.viewModel.ts']);
  });

  it('does not treat an added barrel export as a change to its existing exports', () => {
    const files = {
      'src/client.gen/model/new.ts': 'export const newDefaults = { value: 1 };',
      'src/client.gen/model/login.ts': 'export const loginDefaults = { email: "a" };',
      'src/client.gen/model/index.ts': "export * from './login'; export * from './new';",
      'src/features/login/Login.viewModel.ts': "import { loginDefaults } from '@/client.gen/model'; export const useSignIn = () => loginDefaults;",
      'src/features/new/New.viewModel.ts': "import { newDefaults } from '@/client.gen/model'; export const useNew = () => newDefaults;",
    };
    expect(analyze(files, 'src/client.gen/model/index.ts', "export * from './login';").files)
      .toEqual(['src/features/new/New.viewModel.ts']);
  });

  it('keeps deleted-export consumers selected so they cannot disappear behind a zero-test result', () => {
    const files = {
      'src/client.gen/api.ts': 'export const useLogin = () => 1;',
      'src/features/wallet/Wallet.viewModel.ts': "import { useWithdraw } from '@/client.gen/api'; export const useWallet = () => useWithdraw();",
    };
    expect(analyze(files, 'src/client.gen/api.ts', 'export const useWithdraw = () => 1; export const useLogin = () => 1;').files)
      .toEqual(['src/features/wallet/Wallet.viewModel.ts']);
  });

  it('keeps namespace imports conservative and handles cyclic re-exports', () => {
    const files = {
      'src/client.gen/api.ts': 'export const useWithdraw = () => 2;',
      'src/client.gen/index.ts': "export * from './api'; export * from './other';",
      'src/client.gen/other.ts': "export * from './index';",
      'src/features/wallet/Wallet.viewModel.ts': "import * as api from '@/client.gen'; export const useWallet = () => api.useWithdraw();",
    };
    expect(analyze(files, 'src/client.gen/api.ts', 'export const useWithdraw = () => 1;').files)
      .toEqual(['src/features/wallet/Wallet.viewModel.ts']);
  });

  it('leaves formatting, generator banners and erased overloads out of the runtime selection', () => {
    const files = {
      'src/client.gen/api.ts': '// updated generator\n export const useLogin = () => 1;',
      'src/features/login/Login.viewModel.ts': "import { useLogin } from '@/client.gen/api'; export const useSignIn = () => useLogin();",
    };
    expect(analyze(files, 'src/client.gen/api.ts', 'export const useLogin=()=>1;').files).toEqual([]);
    const before = 'export function useLogin(input: number): number; export function useLogin(input: any) { return input; }';
    files['src/client.gen/api.ts'] = before.replace('input: number', 'input: string');
    expect(analyze(files, 'src/client.gen/api.ts', before).files).toEqual([]);
  });
});
