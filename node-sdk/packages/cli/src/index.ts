import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const methods = ["delete", "get", "patch", "post", "put"] as const;
type Method = (typeof methods)[number];

/** Options for the first, intentionally small slice generator. */
export interface GenerateSliceOptions {
  readonly cwd: string;
  readonly root: string;
  readonly module: string;
  readonly name: string;
  readonly method: Method;
  readonly route: string;
  readonly dryRun?: boolean;
}

/** Streams used by the CLI, injectable so command behavior stays directly testable. */
export interface CliIo {
  readonly out: (message: string) => void;
  readonly error: (message: string) => void;
}

const defaultIo: CliIo = {
  out: (message) => console.log(message),
  error: (message) => console.error(message),
};

function toKebab(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

function requireIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`${label} must be a PascalCase identifier`);
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function sliceSource(name: string, method: Method, route: string): string {
  return `import type { Router } from "express";
import { type Result } from "@skiesjs/core";
import { endpoint } from "@skiesjs/express";

export type Input = Record<string, never>;

export interface Output {
  readonly message: string;
}

export async function handle(_input: Input): Promise<Result<Output>> {
  throw new Error("Implement ${name}.handle");
}

export function map(router: Router): void {
  router.${method}(${JSON.stringify(route)}, endpoint(() => handle({})));
}
`;
}

function testSource(name: string, fileBase: string): string {
  return `import { describe, expect, it } from "vitest";
import * as ${name} from "./${fileBase}.slice.js";

describe("${name}", () => {
  it("implements the operation's real behavior", async () => {
    const result = await ${name}.handle({});

    expect(result.ok).toBe(true);
  });
});
`;
}

/** Create a plain TypeScript slice and its co-located test without discovery or generated runtime behavior. */
export async function generateSlice(options: GenerateSliceOptions): Promise<readonly string[]> {
  requireIdentifier(options.module, "module");
  requireIdentifier(options.name, "slice name");
  if (!options.route.startsWith("/")) throw new Error("route must start with /");

  const moduleName = toKebab(options.module);
  const fileBase = toKebab(options.name);
  const directory = path.resolve(options.cwd, options.root, "modules", moduleName, "slices");
  const slice = path.join(directory, `${fileBase}.slice.ts`);
  const test = path.join(directory, `${fileBase}.slice.test.ts`);
  const created = [slice, test] as const;

  for (const file of created) {
    if (await exists(file)) throw new Error(`${file} already exists`);
  }
  if (options.dryRun) return created;

  await mkdir(directory, { recursive: true });
  await writeFile(slice, sliceSource(options.name, options.method, options.route), { encoding: "utf8", flag: "wx" });
  await writeFile(test, testSource(options.name, fileBase), { encoding: "utf8", flag: "wx" });
  return created;
}

const help = `Skies Node.js

Usage:
  skies-node g slice <Module> <Name> --method <verb> --route <path> [options]

Options:
  --cwd <path>    application directory (default: current directory)
  --root <path>   source root (default: src)
  --dry-run       print target paths without writing
  -h, --help      show this help
`;

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

/** Execute the command-line contract and return a process exit code. */
export async function run(args: readonly string[], io: CliIo = defaultIo): Promise<number> {
  // Help is intentionally handled before cwd lookup or command validation so it is safe outside a project.
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    io.out(help);
    return 0;
  }

  if ((args[0] !== "g" && args[0] !== "generate") || args[1] !== "slice" || !args[2] || !args[3]) {
    io.error("skies-node: expected `g slice <Module> <Name>`; run with --help for usage");
    return 1;
  }

  const method = option(args, "--method");
  const route = option(args, "--route");
  if (!method || !methods.includes(method as Method) || !route) {
    io.error("skies-node: `g slice` requires --method delete|get|patch|post|put and --route /path");
    return 1;
  }

  try {
    const files = await generateSlice({
      cwd: option(args, "--cwd") ?? process.cwd(),
      root: option(args, "--root") ?? "src",
      module: args[2],
      name: args[3],
      method: method as Method,
      route,
      dryRun: args.includes("--dry-run"),
    });
    for (const file of files) io.out(`${args.includes("--dry-run") ? "would create" : "created"} ${file}`);
    if (!args.includes("--dry-run")) {
      io.out("next: implement handle, replace the red scaffold assertion, and register map explicitly in the module");
    }
    return 0;
  } catch (caught) {
    io.error(`skies-node: ${caught instanceof Error ? caught.message : String(caught)}`);
    return 1;
  }
}
