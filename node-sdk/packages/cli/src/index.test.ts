import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename as nativeRename,
  rm,
  writeFile as nativeWriteFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  apply,
  generateContext,
  generateModule,
  generateSlice,
  preflight,
  run,
  type FilePlan,
} from "./index.js";

const execute = promisify(execFile);
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "skies-node-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

const registrySource = `import type { Express } from "express";
import * as Health from "./modules/health/health.module.js";

export function mapModules(app: Express): void {
  Health.map(app);
}
`;

async function project(): Promise<string> {
  const cwd = await temporaryDirectory();
  await mkdir(path.join(cwd, "src"), { recursive: true });
  await nativeWriteFile(path.join(cwd, "src/modules.ts"), registrySource, "utf8");
  return cwd;
}

async function absent(target: string): Promise<void> {
  await expect(readFile(target)).rejects.toMatchObject({ code: "ENOENT" });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("FilePlan", () => {
  it("reports every collision in preflight before any write", async () => {
    const root = await temporaryDirectory();
    await nativeWriteFile(path.join(root, "one.txt"), "one-before");
    await nativeWriteFile(path.join(root, "two.txt"), "two-before");
    const plan: FilePlan = {
      root,
      files: [
        { target: "one.txt", contents: "one-after" },
        { target: "two.txt", contents: "two-after" },
        { target: "new/three.txt", contents: "three" },
      ],
    };

    const failure: unknown = await preflight(plan).catch((caught: unknown) => caught);
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error("preflight should have failed");

    expect(failure.message).toContain("one.txt");
    expect(failure.message).toContain("two.txt");
    expect(await readFile(path.join(root, "one.txt"), "utf8")).toBe("one-before");
    expect(await readFile(path.join(root, "two.txt"), "utf8")).toBe("two-before");
    await absent(path.join(root, "new/three.txt"));
  });

  it("rejects traversal and duplicate normalized targets", async () => {
    const root = await temporaryDirectory();

    await expect(apply({ root, files: [{ target: "../escape.txt", contents: "escape" }] })).rejects.toThrow(
      "escapes root",
    );
    await expect(
      apply({
        root,
        files: [
          { target: "nested/../same.txt", contents: "one" },
          { target: "same.txt", contents: "two" },
        ],
      }),
    ).rejects.toThrow("duplicate target");
    await absent(path.join(root, "../escape.txt"));
  });

  it("returns a deterministic dry run with zero writes", async () => {
    const root = await temporaryDirectory();
    const plan: FilePlan = {
      root,
      files: [
        { target: "z/second.txt", contents: "second" },
        { target: "a/first.txt", contents: "first" },
      ],
    };

    const first = await apply(plan, { dryRun: true });
    const second = await apply(plan, { dryRun: true });

    expect(second).toEqual(first);
    expect(first).toEqual([path.join(root, "z/second.txt"), path.join(root, "a/first.txt")]);
    expect(await readdir(root)).toEqual([]);
  });

  it.each(["write", "rename"] as const)("rolls back created files and empty directories after an injected %s fault", async (fault) => {
    const root = await temporaryDirectory();
    const plan: FilePlan = {
      root,
      files: [
        { target: "generated/deep/one.txt", contents: "one" },
        { target: "generated/deep/two.txt", contents: "two" },
      ],
    };
    let calls = 0;
    const operations =
      fault === "write"
        ? {
            writeFile: async (target: string, contents: Uint8Array): Promise<void> => {
              calls += 1;
              if (calls === 2) throw new Error("injected write failure");
              await nativeWriteFile(target, contents, { flag: "wx" });
            },
          }
        : {
            rename: async (from: string, to: string): Promise<void> => {
              calls += 1;
              await nativeRename(from, to);
              if (calls === 2) throw new Error("injected rename failure");
            },
          };

    await expect(apply(plan, { operations })).rejects.toThrow(`injected ${fault} failure`);

    expect(await readdir(root)).toEqual([]);
  });

  it("restores an exact replacement when rename moves it and then reports failure", async () => {
    const root = await temporaryDirectory();
    await mkdir(path.join(root, "src"));
    const registry = path.join(root, "src/modules.ts");
    const before = Buffer.from("registry-before\n");
    await nativeWriteFile(registry, before);
    const plan: FilePlan = {
      root,
      files: [
        { target: "src/modules/billing/billing.module.ts", contents: "module\n" },
        { target: "src/modules/billing/billing.ctx.md", contents: "context\n" },
        { target: registry, contents: "registry-after\n", expectedContents: before },
      ],
    };
    let renames = 0;

    await expect(
      apply(plan, {
        operations: {
          rename: async (from, to) => {
            renames += 1;
            await nativeRename(from, to);
            if (renames === 3) throw new Error("failure after registry move");
          },
        },
      }),
    ).rejects.toThrow("failure after registry move");

    expect(await readFile(registry)).toEqual(before);
    expect(await readdir(path.join(root, "src"))).toEqual(["modules.ts"]);
  });
});

describe("structural generators", () => {
  it("generates the module/context snapshots and registers both explicit edges", async () => {
    const cwd = await project();

    const files = await generateModule({ cwd, root: "src", module: "Billing" });
    const snapshot = {
      paths: files.map((file) => path.relative(cwd, file).replaceAll(path.sep, "/")),
      module: await readFile(files[0]!, "utf8"),
      context: await readFile(files[1]!, "utf8"),
      registry: await readFile(files[2]!, "utf8"),
    };

    expect(snapshot).toMatchInlineSnapshot(`
      {
        "context": "# Billing

      Describe Billing's purpose in one to three lines.

      ## Boundaries

      - **Inside:** Define the behavior and rules owned by Billing.
      - **Outside:** Keep cross-module behavior and shared infrastructure with their owners.

      ## Design notes

      Record non-obvious invariants and why they hold. Replace this scaffold as the design becomes concrete.
      ",
        "module": "import type { Express } from "express";

      export function map(app: Express): void {
        // Register this module's slices explicitly here.
        void app;
      }
      ",
        "paths": [
          "src/modules/billing/billing.module.ts",
          "src/modules/billing/billing.ctx.md",
          "src/modules.ts",
        ],
        "registry": "import type { Express } from "express";
      import * as Health from "./modules/health/health.module.js";
      import * as Billing from "./modules/billing/billing.module.js";

      export function mapModules(app: Express): void {
        Health.map(app);
        Billing.map(app);
      }
      ",
      }
    `);
  });

  it("preserves the current OpenAPI registry arguments in a new module edge", async () => {
    const cwd = await temporaryDirectory();
    await mkdir(path.join(cwd, "src"));
    await nativeWriteFile(
      path.join(cwd, "src/modules.ts"),
      `import type { Express } from "express";
import type { OpenApiRegistry } from "@skiesjs/openapi";
import * as Health from "./modules/health/health.module.js";

export function mapModules(app: Express, openApi: OpenApiRegistry): void {
  Health.map(app, openApi);
}
`,
    );

    const files = await generateModule({ cwd, root: "src", module: "Billing" });

    expect(await readFile(files[0]!, "utf8")).toContain("map(app: Express, openApi: OpenApiRegistry)");
    expect(await readFile(files[0]!, "utf8")).toContain("const router = Router()");
    expect(await readFile(files[2]!, "utf8")).toContain("Billing.map(app, openApi);");
  });

  it("leaves the registry and every other target byte-for-byte unchanged on one collision", async () => {
    const cwd = await project();
    const registry = path.join(cwd, "src/modules.ts");
    const before = await readFile(registry);
    const context = path.join(cwd, "src/modules/billing/billing.ctx.md");
    await mkdir(path.dirname(context), { recursive: true });
    await nativeWriteFile(context, "keep-this-context\n");

    await expect(generateModule({ cwd, root: "src", module: "Billing" })).rejects.toThrow("already exists");

    expect(await readFile(registry)).toEqual(before);
    expect(await readFile(context, "utf8")).toBe("keep-this-context\n");
    await absent(path.join(cwd, "src/modules/billing/billing.module.ts"));
  });

  it("refuses to overwrite a context", async () => {
    const cwd = await temporaryDirectory();
    const options = { cwd, root: "src", module: "Billing" };
    const [context] = await generateContext(options);
    await nativeWriteFile(context!, "authored context\n");

    await expect(generateContext(options)).rejects.toThrow("already exists");

    expect(await readFile(context!, "utf8")).toBe("authored context\n");
  });

  it("validates registry structure before creating module files", async () => {
    const cwd = await project();
    await nativeWriteFile(path.join(cwd, "src/modules.ts"), "export const modules = [];\n");

    await expect(generateModule({ cwd, root: "src", module: "Billing" })).rejects.toThrow("mapModules");

    await absent(path.join(cwd, "src/modules/billing/billing.module.ts"));
  });
});

describe("generateSlice", () => {
  it("creates the canonical write slice with a unit smoke and happy/sad journeys", async () => {
    const cwd = await temporaryDirectory();

    const files = await generateSlice({
      cwd,
      root: "src",
      module: "Billing",
      name: "CreateInvoice",
      method: "post",
      route: "/invoices",
    });

    expect(files.map((file) => path.relative(cwd, file))).toEqual([
      path.join("src", "modules", "billing", "slices", "create-invoice.slice.ts"),
      path.join("src", "modules", "billing", "slices", "create-invoice.slice.test.ts"),
      path.join("src", "modules", "billing", "slices", "create-invoice.slice.journey.ts"),
    ]);
    const source = await readFile(files[0]!, "utf8");
    expect(source.indexOf("export interface Input")).toBeLessThan(source.indexOf("export interface Output"));
    expect(source.indexOf("export interface Output")).toBeLessThan(source.indexOf("export async function handle"));
    expect(source.indexOf("export async function handle")).toBeLessThan(source.indexOf("export function map"));
    expect(source).toContain("defineContract({");
    expect(source).toContain('auth: "anonymous"');
    expect(source).toContain('kind: "app"');
    expect(source).toContain("mapSlice(router, openApi, contract");
    expect(source).toContain("// @skies-criterion billing.create_invoice.ready");
    expect(source).not.toContain("router.post(");
    const test = await readFile(files[1]!, "utf8");
    expect(test).toContain('{ message: "ready" }');
    expect(test).not.toContain("@skies-proof");
    expect(test).toContain('unit("returns the runnable scaffold result"');
    const journey = await readFile(files[2]!, "utf8");
    expect(journey).toContain('path: JourneyPath.Happy, criterion: "billing.create_invoice.ready"');
    expect(journey).toContain("path: JourneyPath.Sad");
    expect(journey).toContain("expect(afterState).toEqual(beforeState)");
  });

  it("preflights both slice collisions before creating either file", async () => {
    const cwd = await temporaryDirectory();
    const test = path.join(cwd, "src/modules/billing/slices/create-invoice.slice.test.ts");
    await mkdir(path.dirname(test), { recursive: true });
    await nativeWriteFile(test, "existing-test\n");

    await expect(
      generateSlice({ cwd, root: "src", module: "Billing", name: "CreateInvoice", method: "post", route: "/invoices" }),
    ).rejects.toThrow("already exists");

    expect(await readFile(test, "utf8")).toBe("existing-test\n");
    await absent(path.join(path.dirname(test), "create-invoice.slice.ts"));
  });
});

describe("run", () => {
  it("shows all generator help before attempting project discovery", async () => {
    const messages: string[] = [];

    const exitCode = await run(["--help"], { out: (message) => messages.push(message), error: () => undefined });

    expect(exitCode).toBe(0);
    expect(messages.join("\n")).toContain("new <directory>");
    expect(messages.join("\n")).toContain("g module <Module>");
    expect(messages.join("\n")).toContain("g context <Module>");
    expect(messages.join("\n")).toContain("g slice <Module> <Name>");
    expect(messages.join("\n")).toContain("g entity <Module> <Name>");
    expect(messages.join("\n")).toContain("g crud <Module> <Name>");
    expect(messages.join("\n")).toContain("g hub <Module> <Name>");
    expect(messages.join("\n")).toContain("g auth:otp");
    expect(messages.join("\n")).toContain("g error-code <Module> <Name>");
    expect(messages.join("\n")).toContain("g value-object <Module> <Name>");
    expect(messages.join("\n")).toContain("g page <Module> <Name>");
    expect(messages.join("\n")).toContain("g storage");
    expect(messages.join("\n")).toContain("g auth");
  });

  it("ships an executable Node shebang entrypoint", async () => {
    const bin = path.resolve(import.meta.dirname, "../bin/skies-node.mjs");

    const { stdout } = await execute(process.execPath, [bin, "--help"]);

    expect(stdout).toContain("Skies Node.js");
  });
});
