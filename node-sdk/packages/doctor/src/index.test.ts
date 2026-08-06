import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { inspectWorkspace, run } from "./index.js";

const execute = promisify(execFile);
const temporaryDirectories: string[] = [];

const validFiles: Readonly<Record<string, string>> = {
  "src/modules.ts": `import * as Billing from "./modules/billing/billing.module.js";

export function mapModules(app: object): void {
  Billing.map(app);
}
`,
  "src/modules/billing/billing.module.ts": `import * as CreateInvoice from "./slices/create-invoice.slice.js";

export function map(router: object): void {
  CreateInvoice.map(router);
}
`,
  "src/modules/billing/billing.ctx.md": `# Billing

## Boundaries

The module exposes the \`handle\` operation.

## Design notes

Routes enter through \`map\`.
`,
  "src/modules/billing/slices/create-invoice.slice.ts": `import { defineContract } from "@skiesjs/openapi";

// @skies-criterion billing.invoice-readable
export const contract = defineContract({
  operationId: "Billing.ReadInvoice",
  method: "get",
  auth: "anonymous",
  kind: "app",
  path: "/invoices/{id}",
  request: {},
  success: { status: 200, output: {} },
});

export async function handle(): Promise<void> {}

export function map(router: object): void {
  void router;
}
`,
  "src/modules/billing/slices/create-invoice.slice.test.ts": `import { expect } from "vitest";
import { e2e } from "@skiesjs/testing";
import * as CreateInvoice from "./create-invoice.slice.js";

// @skies-proof billing.invoice-readable
e2e("maps", () => {
  CreateInvoice.map({});
  expect(CreateInvoice.contract.operationId).toBe("Billing.ReadInvoice");
});
`,
};

async function temporaryWorkspace(files: Readonly<Record<string, string>> = validFiles): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "skies-node-doctor-"));
  temporaryDirectories.push(root);
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }
  return root;
}

async function replaceFile(root: string, relativePath: string, contents: string): Promise<void> {
  await writeFile(path.join(root, ...relativePath.split("/")), contents, "utf8");
}

function codes(result: Awaited<ReturnType<typeof inspectWorkspace>>): readonly string[] {
  return result.findings.map((finding) => finding.code);
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("inspectWorkspace", () => {
  it("accepts a valid explicit module and slice graph", async () => {
    const root = await temporaryWorkspace();

    const result = await inspectWorkspace(root);

    expect(result.incomplete).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it("ignores generated and dependency directories inside src", async () => {
    const root = await temporaryWorkspace({
      ...validFiles,
      "src/build/hidden.module.ts": "export async function map() {}",
      "src/dist/hidden.slice.ts": "export function map(): void {}",
      "src/node_modules/vendor/vendor.module.ts": "export const value = 1;",
    });

    const result = await inspectWorkspace(root);

    expect(result.incomplete).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it("requires the exact sibling test after it is moved or deleted", async () => {
    const root = await temporaryWorkspace();
    const test = path.join(root, "src/modules/billing/slices/create-invoice.slice.test.ts");
    const moved = path.join(root, "src/modules/billing/create-invoice.slice.test.ts");
    await rename(test, moved);

    const movedResult = await inspectWorkspace(root);

    expect(codes(movedResult)).toContain("SKYN0003");
    await rm(moved);

    const deletedResult = await inspectWorkspace(root);

    expect(codes(deletedResult)).toContain("SKYN0003");
  });

  it("reports a missing context and both empty required sections", async () => {
    const root = await temporaryWorkspace();
    const context = path.join(root, "src/modules/billing/billing.ctx.md");
    await rm(context);

    const missing = await inspectWorkspace(root);

    expect(missing.findings.filter((finding) => finding.code === "SKYN0004")).toHaveLength(1);
    await replaceFile(root, "src/modules/billing/billing.ctx.md", `## Boundaries

## Design notes
`);

    const empty = await inspectWorkspace(root);

    expect(empty.findings.filter((finding) => finding.code === "SKYN0004")).toHaveLength(2);
  });

  it("does not borrow a cited symbol from another module", async () => {
    const root = await temporaryWorkspace({
      ...validFiles,
      "src/modules.ts": `import * as Billing from "./modules/billing/billing.module.js";
import * as Shipping from "./modules/shipping/shipping.module.js";

export function mapModules(app: object): void {
  Billing.map(app);
  Shipping.map(app);
}
`,
      "src/modules/billing/billing.ctx.md": `## Boundaries
\`StaleSymbol\` is not owned here.

## Design notes
Use \`map\` explicitly.
`,
      "src/modules/shipping/shipping.module.ts": `export function StaleSymbol(): void {}
export function map(app: object): void { void app; }
`,
      "src/modules/shipping/shipping.ctx.md": `## Boundaries
The \`StaleSymbol\` declaration is local.

## Design notes
Use \`map\` explicitly.
`,
    });

    const result = await inspectWorkspace(root);
    const stale = result.findings.filter((finding) => finding.code === "SKYN0005");

    expect(stale).toHaveLength(1);
    expect(stale[0]?.path).toBe("src/modules/billing/billing.ctx.md");
    expect(stale[0]?.message).toContain("StaleSymbol");
  });

  it("reports unregistered modules and slices independently", async () => {
    const root = await temporaryWorkspace();
    await replaceFile(
      root,
      "src/modules.ts",
      `import * as Billing from "./modules/billing/billing.module.js";
export function mapModules(app: object): void { void app; }
`,
    );

    const unregisteredModule = await inspectWorkspace(root);

    expect(unregisteredModule.findings.some((finding) => finding.code === "SKYN0016" && finding.path.endsWith("billing.module.ts"))).toBe(true);
    await replaceFile(root, "src/modules.ts", validFiles["src/modules.ts"]!);
    await replaceFile(
      root,
      "src/modules/billing/billing.module.ts",
      `import * as CreateInvoice from "./slices/create-invoice.slice.js";
export function map(router: object): void { void router; }
`,
    );

    const unregisteredSlice = await inspectWorkspace(root);

    expect(unregisteredSlice.findings.some((finding) => finding.code === "SKYN0016" && finding.path.endsWith("create-invoice.slice.ts"))).toBe(true);
  });

  it("does not accept map calls hidden in dead helper functions", async () => {
    const root = await temporaryWorkspace();
    await replaceFile(
      root,
      "src/modules/billing/billing.module.ts",
      `import * as CreateInvoice from "./slices/create-invoice.slice.js";
function dead(router: object): void { CreateInvoice.map(router); }
export function map(router: object): void { void router; void dead; }
`,
    );

    const result = await inspectWorkspace(root);

    expect(result.findings.some((finding) => finding.code === "SKYN0016" && finding.path.endsWith("create-invoice.slice.ts"))).toBe(true);
  });

  it("requires a synchronous typed module map", async () => {
    const root = await temporaryWorkspace();
    await replaceFile(
      root,
      "src/modules/billing/billing.module.ts",
      `import * as CreateInvoice from "./slices/create-invoice.slice.js";
export async function map(router) { CreateInvoice.map(router); }
`,
    );

    const result = await inspectWorkspace(root);

    expect(codes(result)).toContain("SKYN0015");
  });
});

describe("run", () => {
  it("returns pass and deterministic JSON output", async () => {
    const root = await temporaryWorkspace();
    const messages: string[] = [];

    const exitCode = await run([root, "--json"], { out: (message) => messages.push(message), error: () => undefined });
    const report = JSON.parse(messages.join("\n")) as { status: string; findings: unknown[] };

    expect(exitCode).toBe(0);
    expect(report.status).toBe("pass");
    expect(report.findings).toEqual([]);
  });

  it("keeps nonempty human and JSON findings in the same deterministic order", async () => {
    const root = await temporaryWorkspace();
    await rm(path.join(root, "src/modules/billing/slices/create-invoice.slice.test.ts"));
    const first: string[] = [];
    const second: string[] = [];
    const human: string[] = [];

    expect(await run([root, "--json"], { out: (message) => first.push(message), error: () => undefined })).toBe(1);
    expect(await run([root, "--json"], { out: (message) => second.push(message), error: () => undefined })).toBe(1);
    expect(first).toEqual(second);
    const report = JSON.parse(first.join("\n")) as { findings: Array<{
      path: string; line: number; column: number; code: string; message: string;
    }> };

    expect(await run([root], { out: (message) => human.push(message), error: () => undefined })).toBe(1);
    expect(human.slice(0, report.findings.length)).toEqual(report.findings.map((item) =>
      `${item.path}:${item.line}:${item.column} ${item.code} ${item.message}`));
  });

  it("writes human findings and returns one when conventions fail", async () => {
    const root = await temporaryWorkspace();
    await rm(path.join(root, "src/modules/billing/slices/create-invoice.slice.test.ts"));
    const messages: string[] = [];

    const exitCode = await run([root], { out: (message) => messages.push(message), error: () => undefined });

    expect(exitCode).toBe(1);
    expect(messages.join("\n")).toContain("SKYN0003");
    expect(messages.join("\n")).toContain("doctor found");
  });

  it("shows executable help before discovery outside a workspace", async () => {
    const root = await temporaryWorkspace({});
    const bin = path.resolve(import.meta.dirname, "../bin/skies-node-doctor.mjs");

    const { stdout } = await execute(process.execPath, [bin, "--help"], { cwd: root });
    const entrypoint = await readFile(bin);

    expect(stdout).toContain("Usage:");
    expect(entrypoint.subarray(0, entrypoint.indexOf(10)).toString()).toBe("#!/usr/bin/env node");
  });

  it("returns incomplete when workspace discovery cannot read src", async () => {
    const root = await temporaryWorkspace({});

    const exitCode = await run([root], { out: () => undefined, error: () => undefined });

    expect(exitCode).toBe(2);
  });
});
