import path from "node:path";
import { apply, type FilePlan } from "./file-plan.js";
import {
  requireIdentifier,
  requireStableCode,
  sourceRoot,
  toCamel,
  toKebab,
  type GeneratorOptions,
} from "./naming.js";
import {
  authSource,
  authTestSource,
  errorCodeSource,
  pageSource,
  pageTestSource,
  storageSource,
  storageTestSource,
  valueObjectSource,
  valueObjectTestSource,
} from "./templates-domain.js";

export interface GenerateErrorCodeOptions extends GeneratorOptions {
  readonly module: string;
  readonly name: string;
  readonly code?: string;
}

export interface GenerateValueObjectOptions extends GeneratorOptions {
  readonly module: string;
  readonly name: string;
}

export interface GeneratePageOptions extends GeneratorOptions {
  readonly module: string;
  readonly name: string;
}

export interface GenerateStorageOptions extends GeneratorOptions {
  readonly directory?: string;
  readonly baseUrl?: string;
  readonly route?: string;
}

export interface GenerateAuthOptions extends GeneratorOptions {
  readonly issuer?: string;
  readonly audience?: string;
}

/** Create one explicit module error-code registry with an initial stable member. */
export async function generateErrorCode(options: GenerateErrorCodeOptions): Promise<readonly string[]> {
  requireIdentifier(options.module, "module");
  requireIdentifier(options.name, "error name");
  const roots = sourceRoot(options);
  const modulePath = toKebab(options.module);
  const code = options.code ?? `${modulePath}.${toKebab(options.name).replaceAll("-", "_")}`;
  requireStableCode(code);
  const plan: FilePlan = {
    root: roots.cwd,
    files: [{
      target: path.join(roots.source, "modules", modulePath, `${modulePath}.errors.ts`),
      contents: errorCodeSource(options.module, toCamel(options.name), code, `${toCamel(options.name)}Error`),
    }],
  };
  return apply(plan, { dryRun: options.dryRun ?? false });
}

/** Create a string value object, its stable validation registry, scalar codec/schema, and focused test. */
export async function generateValueObject(options: GenerateValueObjectOptions): Promise<readonly string[]> {
  requireIdentifier(options.module, "module");
  requireIdentifier(options.name, "value-object name");
  const roots = sourceRoot(options);
  const modulePath = toKebab(options.module);
  const fileBase = toKebab(options.name);
  const valueName = toCamel(options.name);
  const directory = path.join(roots.source, "modules", modulePath, "values");
  const invalidCode = `${modulePath}.${fileBase.replaceAll("-", "_")}.invalid`;
  const plan: FilePlan = {
    root: roots.cwd,
    files: [
      {
        target: path.join(directory, `${fileBase}.errors.ts`),
        contents: errorCodeSource(options.name, "invalid", invalidCode),
      },
      {
        target: path.join(directory, `${fileBase}.ts`),
        contents: valueObjectSource(options.name, valueName, fileBase),
      },
      {
        target: path.join(directory, `${fileBase}.test.ts`),
        contents: valueObjectTestSource(options.name, valueName, fileBase, invalidCode),
      },
    ],
  };
  return apply(plan, { dryRun: options.dryRun ?? false });
}

/** Create an explicit core Page projection, Zod wire schema, and metadata-preservation test. */
export async function generatePage(options: GeneratePageOptions): Promise<readonly string[]> {
  requireIdentifier(options.module, "module");
  requireIdentifier(options.name, "page name");
  const roots = sourceRoot(options);
  const modulePath = toKebab(options.module);
  const fileBase = toKebab(options.name);
  const directory = path.join(roots.source, "modules", modulePath, "pages");
  const plan: FilePlan = {
    root: roots.cwd,
    files: [
      { target: path.join(directory, `${fileBase}.page.ts`), contents: pageSource(options.name, toCamel(options.name)) },
      {
        target: path.join(directory, `${fileBase}.page.test.ts`),
        contents: pageTestSource(options.name, toCamel(options.name), fileBase),
      },
    ],
  };
  return apply(plan, { dryRun: options.dryRun ?? false });
}

/** Create local storage construction and explicit Express route wiring with a focused test. */
export async function generateStorage(options: GenerateStorageOptions): Promise<readonly string[]> {
  const roots = sourceRoot(options);
  const directory = options.directory ?? ".data/files";
  const baseUrl = options.baseUrl ?? "http://localhost:3000/files";
  const route = options.route ?? "/files";
  if (directory.trim().length === 0) throw new Error("storage directory must not be blank");
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    throw new Error("storage base URL must start with http:// or https://");
  }
  if (!route.startsWith("/") || route === "/") throw new Error("storage route must name an absolute path");
  const wiring = path.join(roots.source, "wiring");
  const plan: FilePlan = {
    root: roots.cwd,
    files: [
      { target: path.join(wiring, "storage.ts"), contents: storageSource(directory, baseUrl, route) },
      { target: path.join(wiring, "storage.test.ts"), contents: storageTestSource() },
    ],
  };
  return apply(plan, { dryRun: options.dryRun ?? false });
}

/** Create access-token construction and its explicit Express authorization middleware. */
export async function generateAuth(options: GenerateAuthOptions): Promise<readonly string[]> {
  const roots = sourceRoot(options);
  const issuer = options.issuer ?? "my-app";
  const audience = options.audience ?? "my-app-api";
  if (issuer.trim().length === 0 || audience.trim().length === 0) {
    throw new Error("auth issuer and audience must not be blank");
  }
  const wiring = path.join(roots.source, "wiring");
  const plan: FilePlan = {
    root: roots.cwd,
    files: [
      { target: path.join(wiring, "auth.ts"), contents: authSource(issuer, audience) },
      { target: path.join(wiring, "auth.test.ts"), contents: authTestSource() },
    ],
  };
  return apply(plan, { dryRun: options.dryRun ?? false });
}
