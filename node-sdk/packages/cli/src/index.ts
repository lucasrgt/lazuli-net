import path from "node:path";
import { generateApplication } from "./generate-application.js";
import { generateAuthAugment, type AuthAugment } from "./generators-auth-augment.js";
import {
  generateAuth,
  generateErrorCode,
  generatePage,
  generateStorage,
  generateValueObject,
} from "./generators-domain.js";
import { generateHub } from "./generators-hub.js";
import { generateCrud, generateEntity } from "./generators-persistence.js";
import { generateContext, generateModule, generateSlice } from "./generators.js";
import { toKebab as toModulePath } from "./naming.js";
import { methods, type Method } from "./types.js";

export { apply, preflight } from "./file-plan.js";
export type {
  ApplyFilePlanOptions,
  FilePlan,
  FilePlanContents,
  FilePlanFile,
  FilePlanOperations,
} from "./file-plan.js";
export { generateApplication } from "./generate-application.js";
export type { GenerateApplicationOptions } from "./generate-application.js";
export { generateAuthAugment } from "./generators-auth-augment.js";
export type { AuthAugment, GenerateAuthAugmentOptions } from "./generators-auth-augment.js";
export {
  generateAuth,
  generateErrorCode,
  generatePage,
  generateStorage,
  generateValueObject,
} from "./generators-domain.js";
export type {
  GenerateAuthOptions,
  GenerateErrorCodeOptions,
  GeneratePageOptions,
  GenerateStorageOptions,
  GenerateValueObjectOptions,
} from "./generators-domain.js";
export { generateHub } from "./generators-hub.js";
export type { GenerateHubOptions } from "./generators-hub.js";
export { generateCrud, generateEntity } from "./generators-persistence.js";
export type { GenerateCrudOptions, GenerateEntityOptions } from "./generators-persistence.js";
export { generateContext, generateModule, generateSlice, toKebab } from "./generators.js";
export type { GenerateContextOptions, GenerateModuleOptions, GenerateSliceOptions } from "./generators.js";
export type { Method } from "./types.js";

/** Streams used by the CLI, injectable so command behavior stays directly testable. */
export interface CliIo {
  readonly out: (message: string) => void;
  readonly error: (message: string) => void;
}

const defaultIo: CliIo = {
  out: (message) => console.log(message),
  error: (message) => console.error(message),
};

const help = `Skies Node.js

Usage:
  skies-node new <directory> [--name <package>] [options]
  skies-node g module <Module> [options]
  skies-node g context <Module> [options]
  skies-node g slice <Module> <Name> --method <verb> --route <path> [options]
  skies-node g entity <Module> <Name> [options]
  skies-node g crud <Module> <Name> [options]
  skies-node g hub <Module> <Name> [options]
  skies-node g error-code <Module> <Name> [--code <stable.code>] [options]
  skies-node g value-object <Module> <Name> [options]
  skies-node g page <Module> <Name> [options]
  skies-node g storage [--directory <path>] [--base-url <url>] [--route <path>] [options]
  skies-node g auth [--issuer <value>] [--audience <value>] [options]
  skies-node g auth:otp [options]
  skies-node g auth:oauth [options]
  skies-node g auth:email [options]

Generators:
  new            create a runnable Express/OpenAPI application with a health slice
  module         create a module/context and register it in src/modules.ts
  context        create a missing module context without overwriting
  slice          create a defineContract/mapSlice slice and runnable co-located test
  entity         create an explicit Drizzle pgTable, SQL migration, and shape test
  crud           create one entity-specific five-contract CRUD transaction and proofs
  hub            create an explicit Socket.IO event contract and adapter map
  error-code     create a module *.errors.ts registry with one stable code
  value-object   create a scalarCodec value object, scalarSchema, registry, and test
  page           create a Page projection, Zod wire schema, and test
  storage        create local storage and explicit Express route wiring
  auth           create access-token and explicit authorization middleware wiring
  auth:otp       add digest-only expiring, replay-safe OTP ports and contracts after g auth
  auth:oauth     add sealed PKCE state, provider ports, and replay-safe contracts after g auth
  auth:email     add digest-only expiring, one-use email-link ports and contracts after g auth

Options:
  --cwd <path>    application directory, or parent directory for new (default: current directory)
  --root <path>   source root beneath cwd for g commands (default: src)
  --dry-run       preflight and print deterministic target paths without writing
  -h, --help      show this help
`;

function validateOptions(
  args: readonly string[],
  start: number,
  valueOptions: readonly string[],
  booleanOptions: readonly string[] = ["--dry-run"],
): void {
  const seen = new Set<string>();
  for (let index = start; index < args.length; index += 1) {
    const token = args[index]!;
    if (seen.has(token)) throw new Error(`${token} may be supplied only once`);
    seen.add(token);
    if (booleanOptions.includes(token)) continue;
    if (!valueOptions.includes(token)) throw new Error(`unknown argument: ${token}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${token} requires a value`);
    index += 1;
  }
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function commonOptions(args: readonly string[]): { cwd: string; root: string; dryRun: boolean } {
  return {
    cwd: option(args, "--cwd") ?? process.cwd(),
    root: option(args, "--root") ?? "src",
    dryRun: args.includes("--dry-run"),
  };
}

function printFiles(files: readonly string[], dryRun: boolean, io: CliIo, updatedTargets: readonly string[] = []): void {
  const updates = new Set(updatedTargets.map((target) => path.resolve(target)));
  for (const file of files) {
    const action = updates.has(path.resolve(file)) ? "update" : "create";
    io.out(`${dryRun ? `would ${action}` : `${action}d`} ${file}`);
  }
}

async function runNew(args: readonly string[], io: CliIo): Promise<number> {
  if (!args[1] || args[1].startsWith("--")) {
    io.error("skies-node: expected `new <directory>`; run with --help for usage");
    return 1;
  }
  validateOptions(args, 2, ["--cwd", "--name"]);
  const cwd = option(args, "--cwd") ?? process.cwd();
  const dryRun = args.includes("--dry-run");
  const files = await generateApplication({
    cwd,
    directory: args[1],
    ...(option(args, "--name") === undefined ? {} : { name: option(args, "--name")! }),
    dryRun,
  });
  printFiles(files, dryRun, io);
  if (!dryRun) io.out(`next: cd ${args[1]} && npm install && npm run check && npm run build && npm start`);
  return 0;
}

async function runSlice(args: readonly string[], io: CliIo): Promise<number> {
  if (!args[2] || !args[3] || args[2].startsWith("--") || args[3].startsWith("--")) {
    io.error("skies-node: expected `g slice <Module> <Name>`; run with --help for usage");
    return 1;
  }
  validateOptions(args, 4, ["--cwd", "--root", "--method", "--route"]);
  const method = option(args, "--method");
  const route = option(args, "--route");
  if (!method || !methods.includes(method as Method) || !route) {
    io.error("skies-node: `g slice` requires --method delete|get|patch|post|put and --route /path");
    return 1;
  }
  const common = commonOptions(args);
  const files = await generateSlice({
    ...common, module: args[2], name: args[3], method: method as Method, route,
  });
  const modulePath = toModulePath(args[2]);
  const moduleFile = path.resolve(common.cwd, common.root, "modules", modulePath, `${modulePath}.module.ts`);
  const manifest = path.resolve(common.cwd, "skies.node.json");
  printFiles(files, common.dryRun, io, [moduleFile, manifest]);
  if (!common.dryRun) io.out("next: replace the runnable scaffold behavior with the slice's real operation");
  return 0;
}

type NamedCommand = "module" | "context" | "error-code" | "value-object" | "page" | "entity" | "crud" | "hub";

async function runNamed(args: readonly string[], io: CliIo, command: NamedCommand): Promise<number> {
  const requiresName = !["module", "context"].includes(command);
  if (!args[2] || (requiresName && !args[3]) || args[2].startsWith("--")
    || (requiresName && args[3]!.startsWith("--"))) {
    const suffix = requiresName ? "<Module> <Name>" : "<Module>";
    io.error(`skies-node: expected \`g ${command} ${suffix}\`; run with --help for usage`);
    return 1;
  }
  validateOptions(args, requiresName ? 4 : 3, ["--cwd", "--root", ...(command === "error-code" ? ["--code"] : [])]);
  const common = commonOptions(args);
  let files: readonly string[];
  if (command === "module") files = await generateModule({ ...common, module: args[2] });
  else if (command === "context") files = await generateContext({ ...common, module: args[2] });
  else if (command === "error-code") {
    const code = option(args, "--code");
    files = await generateErrorCode({
      ...common, module: args[2], name: args[3]!, ...(code === undefined ? {} : { code }),
    });
  } else if (command === "value-object") {
    files = await generateValueObject({ ...common, module: args[2], name: args[3]! });
  } else if (command === "page") {
    files = await generatePage({ ...common, module: args[2], name: args[3]! });
  } else if (command === "entity") {
    files = await generateEntity({ ...common, module: args[2], name: args[3]! });
  } else if (command === "crud") {
    files = await generateCrud({ ...common, module: args[2], name: args[3]! });
  } else files = await generateHub({ ...common, module: args[2], name: args[3]! });
  const modulePath = toModulePath(args[2]);
  const updated = [
    path.resolve(common.cwd, "skies.node.json"),
    path.resolve(common.cwd, common.root, "modules", modulePath, `${modulePath}.module.ts`),
    path.resolve(common.cwd, common.root, "modules.ts"),
  ];
  printFiles(files, common.dryRun, io, updated);
  return 0;
}

async function runWiring(args: readonly string[], io: CliIo, command: "storage" | "auth"): Promise<number> {
  validateOptions(
    args,
    2,
    command === "storage"
      ? ["--cwd", "--root", "--directory", "--base-url", "--route"]
      : ["--cwd", "--root", "--issuer", "--audience"],
  );
  const common = commonOptions(args);
  const files = command === "storage"
    ? await generateStorage({
        ...common,
        ...(option(args, "--directory") === undefined ? {} : { directory: option(args, "--directory")! }),
        ...(option(args, "--base-url") === undefined ? {} : { baseUrl: option(args, "--base-url")! }),
        ...(option(args, "--route") === undefined ? {} : { route: option(args, "--route")! }),
      })
    : await generateAuth({
        ...common,
        ...(option(args, "--issuer") === undefined ? {} : { issuer: option(args, "--issuer")! }),
        ...(option(args, "--audience") === undefined ? {} : { audience: option(args, "--audience")! }),
      });
  printFiles(files, common.dryRun, io);
  return 0;
}

async function runAuthAugment(args: readonly string[], io: CliIo, mode: AuthAugment): Promise<number> {
  validateOptions(args, 2, ["--cwd", "--root"]);
  const common = commonOptions(args);
  const files = await generateAuthAugment({ ...common, mode });
  printFiles(files, common.dryRun, io, [path.resolve(common.cwd, "skies.node.json")]);
  return 0;
}

/** Execute the command-line contract and return a process exit code. */
export async function run(args: readonly string[], io: CliIo = defaultIo): Promise<number> {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    io.out(help);
    return 0;
  }
  try {
    if (args[0] === "new") return await runNew(args, io);
    if (args[0] !== "g" && args[0] !== "generate") {
      io.error("skies-node: expected `new` or `g <generator>`; run with --help for usage");
      return 1;
    }
    if (args[1] === "slice") return await runSlice(args, io);
    const named: readonly NamedCommand[] = [
      "module", "context", "error-code", "value-object", "page", "entity", "crud", "hub",
    ];
    if (named.includes(args[1] as NamedCommand)) return await runNamed(args, io, args[1] as NamedCommand);
    if (args[1] === "storage" || args[1] === "auth") return await runWiring(args, io, args[1]);
    if (args[1] === "auth:otp" || args[1] === "auth:oauth" || args[1] === "auth:email") {
      return await runAuthAugment(args, io, args[1].slice("auth:".length) as AuthAugment);
    }
    io.error("skies-node: unknown generator; run with --help for usage");
    return 1;
  } catch (caught) {
    io.error(`skies-node: ${caught instanceof Error ? caught.message : String(caught)}`);
    return 1;
  }
}
