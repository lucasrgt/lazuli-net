import { readFile } from "node:fs/promises";
import path from "node:path";
import { apply, type FilePlan, type FilePlanFile } from "./file-plan.js";
import { requireIdentifier, sourceRoot, toKebab, type GeneratorOptions } from "./naming.js";
import { registerGeneratedProof } from "./proof-registry.js";
import { hubSource, hubTestSource } from "./templates-hub.js";

export interface GenerateHubOptions extends GeneratorOptions {
  readonly module: string;
  readonly name: string;
}

function missing(caught: unknown): boolean {
  return (caught as NodeJS.ErrnoException).code === "ENOENT";
}


function withHubDependencies(source: string, file: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${file} is not valid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${file} must contain a JSON object`);
  }
  const manifest = parsed as Record<string, unknown>;
  const current = manifest.dependencies;
  if (current !== undefined && (typeof current !== "object" || current === null || Array.isArray(current))) {
    throw new Error(`${file} dependencies must be an object`);
  }
  const dependencies = { ...((current ?? {}) as Record<string, unknown>) };
  dependencies["@skiesjs/socketio"] ??= "0.1.0";
  dependencies["socket.io"] ??= "^4.8.3";
  manifest.dependencies = Object.fromEntries(Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right)));
  return `${JSON.stringify(manifest, undefined, 2)}\n`;
}

/** Create one explicit Socket.IO event contract and map function against the actual adapter API. */
export async function generateHub(options: GenerateHubOptions): Promise<readonly string[]> {
  requireIdentifier(options.module, "module");
  requireIdentifier(options.name, "hub name");
  const roots = sourceRoot(options);
  const modulePath = toKebab(options.module);
  const fileBase = toKebab(options.name);
  const moduleDirectory = path.join(roots.source, "modules", modulePath);
  const moduleFile = path.join(moduleDirectory, `${modulePath}.module.ts`);
  await readFile(moduleFile).catch((caught: unknown) => {
    if (missing(caught)) throw new Error(`${moduleFile} does not exist; generate the module first`);
    throw caught;
  });
  const directory = path.join(moduleDirectory, "hubs");
  const sourceFile = path.join(directory, `${fileBase}.hub.ts`);
  const testFile = path.join(directory, `${fileBase}.hub.test.ts`);
  const criterion = `${modulePath}.${fileBase}.socket_event`;
  const packageFile = path.join(roots.cwd, "package.json");
  const packageBytes = await readFile(packageFile);
  const packageSource = packageBytes.toString("utf8");
  if (!Buffer.from(packageSource, "utf8").equals(packageBytes)) throw new Error(`${packageFile} is not valid UTF-8`);
  const files: FilePlanFile[] = [
    {
      target: sourceFile,
      contents: hubSource(options.module, options.name, `${modulePath}:${fileBase}`, criterion),
    },
    { target: testFile, contents: hubTestSource(options.name, fileBase, criterion) },
    {
      target: packageFile,
      contents: withHubDependencies(packageSource, packageFile),
      expectedContents: packageBytes,
    },
  ];
  const manifestFile = path.join(roots.cwd, "skies.node.json");
  const manifestBytes = await readFile(manifestFile).catch((caught: unknown) => {
    if (missing(caught)) return undefined;
    throw caught;
  });
  if (manifestBytes !== undefined) {
    const source = manifestBytes.toString("utf8");
    if (!Buffer.from(source, "utf8").equals(manifestBytes)) throw new Error(`${manifestFile} is not valid UTF-8`);
    const relative = (target: string): string => path.relative(roots.cwd, target).split(path.sep).join("/");
    files.push({
      target: manifestFile,
      contents: registerGeneratedProof(source, {
        proofId: `${modulePath}-${fileBase}-socket-unit`,
        criterionId: criterion,
        statement: `${options.name} validates and acknowledges its explicit Socket.IO event.`,
        kind: "unit",
        sourceScopes: [relative(sourceFile), relative(testFile)],
      }),
      expectedContents: manifestBytes,
    });
  }
  const plan: FilePlan = { root: roots.cwd, files };
  return apply(plan, { dryRun: options.dryRun ?? false });
}
