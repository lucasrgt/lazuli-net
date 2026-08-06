import { readFile } from "node:fs/promises";
import path from "node:path";
import { apply, type FilePlan } from "./file-plan.js";
import { requireIdentifier, sourceRoot, toKebab, type GeneratorOptions } from "./naming.js";
import { moduleRegistryUsesOpenApi, registerModule } from "./registry.js";
import { registerGeneratedProof } from "./proof-registry.js";
import { registerSlice, supportsSliceRegistration } from "./slice-registry.js";
import { contextSource, moduleSource, sliceJourneySource, sliceSource, sliceTestSource } from "./templates.js";
import type { Method } from "./types.js";

/** Options for a contract-backed slice and its runnable co-located test. */
export interface GenerateSliceOptions extends GeneratorOptions {
  readonly module: string;
  readonly name: string;
  readonly method: Method;
  readonly route: string;
}

export interface GenerateModuleOptions extends GeneratorOptions {
  readonly module: string;
}

export interface GenerateContextOptions extends GeneratorOptions {
  readonly module: string;
}

/** Create a plain TypeScript contract-backed slice and its co-located test. */
export async function generateSlice(options: GenerateSliceOptions): Promise<readonly string[]> {
  requireIdentifier(options.module, "module");
  requireIdentifier(options.name, "slice name");
  if (!options.route.startsWith("/")) throw new Error("route must start with /");

  const roots = sourceRoot(options);
  const moduleName = toKebab(options.module);
  const fileBase = toKebab(options.name);
  const criterion = `${moduleName}.${fileBase.replaceAll("-", "_")}.ready`;
  const moduleDirectory = path.join(roots.source, "modules", moduleName);
  const directory = path.join(moduleDirectory, "slices");
  const moduleFile = path.join(moduleDirectory, `${moduleName}.module.ts`);
  const moduleBytes = await readFile(moduleFile).catch((caught: unknown) => {
    if ((caught as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw caught;
  });
  let moduleUpdate;
  if (moduleBytes !== undefined) {
    const moduleText = moduleBytes.toString("utf8");
    if (!Buffer.from(moduleText, "utf8").equals(moduleBytes)) throw new Error(`${moduleFile} is not valid UTF-8`);
    if (supportsSliceRegistration(moduleText)) {
      moduleUpdate = {
        target: moduleFile,
        contents: registerSlice(moduleText, options.name, `./slices/${fileBase}.slice.js`),
        expectedContents: moduleBytes,
      } as const;
    }
  }
  const write = ["delete", "patch", "post", "put"].includes(options.method);
  const sliceFile = path.join(directory, `${fileBase}.slice.ts`);
  const testFile = path.join(directory, `${fileBase}.slice.test.ts`);
  const journeyFile = path.join(directory, `${fileBase}.slice.journey.ts`);
  const manifestFile = path.join(roots.cwd, "skies.node.json");
  const manifestBytes = await readFile(manifestFile).catch((caught: unknown) => {
    if ((caught as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw caught;
  });
  const relativeScope = (target: string): string => path.relative(roots.cwd, target).split(path.sep).join("/");
  const manifestUpdate = manifestBytes === undefined ? undefined : {
    target: manifestFile,
    contents: registerGeneratedProof(manifestBytes.toString("utf8"), {
      proofId: `${moduleName}-${fileBase}-${write ? "journey" : "unit"}`,
      criterionId: criterion,
      statement: `${options.name} satisfies its explicit generated contract.`,
      kind: write ? "journey" as const : "unit" as const,
      sourceScopes: [relativeScope(sliceFile), write ? relativeScope(journeyFile) : relativeScope(testFile)],
    }),
    expectedContents: manifestBytes,
  };
  const plan: FilePlan = {
    root: roots.cwd,
    files: [
      { target: sliceFile, contents: sliceSource(options.name, options.method, options.route, criterion) },
      { target: testFile, contents: sliceTestSource(options.name, fileBase, criterion, options.method) },
      ...(write ? [{
        target: journeyFile,
        contents: sliceJourneySource(options.name, fileBase, options.method, options.route, criterion),
      }] : []),
      ...(moduleUpdate === undefined ? [] : [moduleUpdate]),
      ...(manifestUpdate === undefined ? [] : [manifestUpdate]),
    ],
  };
  return apply(plan, { dryRun: options.dryRun ?? false });
}

/** Create a typed module, its required context, and one explicit namespace import/map call in src/modules.ts. */
export async function generateModule(options: GenerateModuleOptions): Promise<readonly string[]> {
  requireIdentifier(options.module, "module");
  const roots = sourceRoot(options);
  const moduleName = toKebab(options.module);
  const directory = path.join(roots.source, "modules", moduleName);
  const registry = path.join(roots.source, "modules.ts");
  const registryBytes = await readFile(registry).catch((caught: unknown) => {
    if ((caught as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`${registry} does not exist`);
    throw caught;
  });
  const registrySource = registryBytes.toString("utf8");
  if (!Buffer.from(registrySource, "utf8").equals(registryBytes)) {
    throw new Error(`${registry} is not valid UTF-8`);
  }
  const withOpenApi = moduleRegistryUsesOpenApi(registrySource);
  const registered = registerModule(
    registrySource,
    options.module,
    `./modules/${moduleName}/${moduleName}.module.js`,
  );
  const plan: FilePlan = {
    root: roots.cwd,
    files: [
      { target: path.join(directory, `${moduleName}.module.ts`), contents: moduleSource(withOpenApi) },
      { target: path.join(directory, `${moduleName}.ctx.md`), contents: contextSource(options.module) },
      { target: registry, contents: registered, expectedContents: registryBytes },
    ],
  };
  return apply(plan, { dryRun: options.dryRun ?? false });
}

/** Create the required context spine for a module while refusing every overwrite. */
export async function generateContext(options: GenerateContextOptions): Promise<readonly string[]> {
  requireIdentifier(options.module, "module");
  const roots = sourceRoot(options);
  const moduleName = toKebab(options.module);
  const plan: FilePlan = {
    root: roots.cwd,
    files: [
      {
        target: path.join(roots.source, "modules", moduleName, `${moduleName}.ctx.md`),
        contents: contextSource(options.module),
      },
    ],
  };
  return apply(plan, { dryRun: options.dryRun ?? false });
}

export { toKebab } from "./naming.js";
