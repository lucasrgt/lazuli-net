import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectWorkspace } from "./index.js";

const temporaryDirectories: string[] = [];

async function workspace(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "skies-doctor-semantic-"));
  temporaryDirectories.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, ...relative.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }
  return root;
}

function moduleFiles(
  slice: string,
  test: string,
  extras: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  return {
    "src/modules.ts": `import * as Billing from "./modules/billing/billing.module.js";
export function mapModules(app: object): void { Billing.map(app); }
`,
    "src/modules/billing/billing.module.ts": `import * as Operation from "./operation.slice.js";
export function map(router: object): void { Operation.map(router); }
`,
    "src/modules/billing/billing.ctx.md": `## Boundaries
The billing operation is explicit.

## Design notes
Registration remains direct.
`,
    "src/modules/billing/operation.slice.ts": slice,
    "src/modules/billing/operation.slice.test.ts": test,
    ...extras,
  };
}

const readSlice = `import { defineContract } from "@skiesjs/openapi";
// @skies-criterion billing.operation.readable
export const contract = defineContract({
  operationId: "Billing.ReadOperation", method: "get", path: "/billing", auth: "anonymous", kind: "app",
  request: {}, success: { status: 200, output: {} },
});
export async function handle(): Promise<void> {}
export function map(router: object): void { void router; }
`;

const readProof = `import { expect } from "vitest";
import { e2e } from "@skiesjs/testing";
// @skies-proof billing.operation.readable
e2e("reads", () => { expect("Billing.ReadOperation").toContain("Read"); });
`;

const writeSlice = `import { defineContract } from "@skiesjs/openapi";
// @skies-criterion billing.operation.created
export const contract = defineContract({
  operationId: "Billing.CreateOperation", method: "post", path: "/billing", auth: "anonymous", kind: "app",
  request: {}, success: { status: 201, output: {} },
});
export async function handle(): Promise<void> {}
export function map(router: object): void { void router; }
`;

const writeTest = `import { expect } from "vitest";
import { e2e } from "@skiesjs/testing";
e2e("unit sibling", () => { expect(true).toBe(true); });
`;

const validJourneys = `import { expect } from "vitest";
import { journey, JourneyPath } from "@skiesjs/testing";
journey(
  { covers: "Billing.CreateOperation", path: JourneyPath.Happy, criterion: "billing.operation.created" },
  "creates", async () => {
    const createdResponse = { status: 201, body: { id: "1" } };
    expect(createdResponse.status).toBe(201);
  },
);
journey(
  { covers: "Billing.CreateOperation", path: JourneyPath.Sad },
  "rejects", async () => {
    const rejectedResponse = { status: 409 };
    const beforeState = { count: 0 };
    const afterState = { count: 0 };
    expect(rejectedResponse.status).toBe(409);
    expect(afterState).toEqual(beforeState);
  },
);
`;

function codes(result: Awaited<ReturnType<typeof inspectWorkspace>>, code: string): number {
  return result.findings.filter((finding) => finding.code === code).length;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("operation contracts and journey evidence", () => {
  it("accepts the complete static happy/sad write convention", async () => {
    const root = await workspace(moduleFiles(writeSlice, writeTest, {
      "src/modules/billing/operation.slice.journey.ts": validJourneys,
    }));
    const result = await inspectWorkspace(root);

    expect(result.incomplete).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it("requires an exported local contract and a stable unique operationId", async () => {
    const noncanonical = writeSlice
      .replace("export const contract", "const contract")
      .replace("operationId: \"Billing.CreateOperation\"", "operationId: makeOperationId()")
      .replace("import { defineContract }", "declare function makeOperationId(): string;\nimport { defineContract }");
    const files = moduleFiles(noncanonical, writeTest, {
      "src/modules/billing/operation.slice.journey.ts": validJourneys,
      "src/modules/billing/second.slice.ts": writeSlice.replaceAll("Operation", "Second"),
      "src/modules/billing/second.slice.test.ts": writeTest,
    });
    const root = await workspace({
      ...files,
      "src/modules/billing/billing.module.ts": `import * as Operation from "./operation.slice.js";
import * as Second from "./second.slice.js";
export function map(router: object): void { Operation.map(router); Second.map(router); }
`,
    });
    const result = await inspectWorkspace(root);

    expect(codes(result, "SKYN0012")).toBeGreaterThan(0);
  });

  it("rejects a workspace-duplicate operationId on every owning contract", async () => {
    const root = await workspace({
      ...moduleFiles(readSlice, readProof),
      "src/modules/billing/second.slice.ts": readSlice,
      "src/modules/billing/second.slice.test.ts": readProof,
      "src/modules/billing/billing.module.ts": `import * as Operation from "./operation.slice.js";
import * as Second from "./second.slice.js";
export function map(router: object): void { Operation.map(router); Second.map(router); }
`,
    });
    const result = await inspectWorkspace(root);

    expect(codes(result, "SKYN0012")).toBe(2);
  });

  it("reports each missing write path without borrowing a journey-like filename", async () => {
    const root = await workspace(moduleFiles(writeSlice, writeTest, {
      "src/modules/billing/operation.slice.journey.ts": `function journey(): void {}\njourney();\n`,
    }));
    const result = await inspectWorkspace(root);

    expect(codes(result, "SKYN0008")).toBe(2);
    expect(codes(result, "SKYN0033")).toBe(1);
  });

  it("does not accept a statically shaped journey hidden in a dead helper", async () => {
    const hidden = `import { expect } from "vitest";
import { journey, JourneyPath } from "@skiesjs/testing";
function dead(): void {
  journey({ covers: "Billing.CreateOperation", path: JourneyPath.Happy }, "hidden", () => {
    const hiddenResponse = { status: 201 };
    expect(hiddenResponse.status).toBe(201);
  });
}
void dead;
`;
    const root = await workspace(moduleFiles(writeSlice, writeTest, {
      "src/modules/billing/operation.slice.journey.ts": hidden,
    }));
    const result = await inspectWorkspace(root);

    expect(codes(result, "SKYN0008")).toBe(2);
    expect(codes(result, "SKYN0033")).toBe(1);
  });

  it("rejects journey evidence in the ordinary test file and duplicate isolated paths", async () => {
    const root = await workspace(moduleFiles(writeSlice, `${writeTest}\n${validJourneys}`, {
      "src/modules/billing/operation.slice.journey.ts": validJourneys.replace(
        "journey(\n  { covers: \"Billing.CreateOperation\", path: JourneyPath.Sad }",
        `${validJourneys.split("journey(\n  { covers: \"Billing.CreateOperation\", path: JourneyPath.Happy")[0]}journey(\n  { covers: \"Billing.CreateOperation\", path: JourneyPath.Happy }`,
      ),
    }));
    const result = await inspectWorkspace(root);

    expect(codes(result, "SKYN0033")).toBeGreaterThan(0);
  });

  it("rejects journeys for reads or a different co-located operation", async () => {
    const root = await workspace(moduleFiles(readSlice, readProof, {
      "src/modules/billing/operation.slice.journey.ts": validJourneys,
    }));
    const result = await inspectWorkspace(root);

    expect(codes(result, "SKYN0010")).toBe(2);
  });

  it("requires response assertions on both paths and an unchanged-state assertion on sad", async () => {
    const weak = validJourneys
      .replace("expect(createdResponse.status).toBe(201);", "expect(true).toBe(true);")
      .replace("expect(afterState).toEqual(beforeState);", "expect(true).toBe(true);");
    const root = await workspace(moduleFiles(writeSlice, writeTest, {
      "src/modules/billing/operation.slice.journey.ts": weak,
    }));
    const result = await inspectWorkspace(root);

    expect(codes(result, "SKYN0020")).toBe(2);
  });
});

describe("composition, auth, and error ownership", () => {
  it("scopes thinness to inline HTTP behavior in src/app.ts", async () => {
    const root = await workspace({
      ...moduleFiles(readSlice, readProof),
      "src/app.ts": `import express from "express";
import { importedHandler } from "./handler.js";
const app = express();
app.get("/safe", importedHandler);
app.post("/hidden", (_request, response) => response.send("business logic"));
`,
      "src/handler.ts": `export function importedHandler(): void {}\n`,
      "src/not-app.ts": `const app = { get: (..._args: unknown[]) => undefined }; app.get("/x", () => 1);\n`,
    });
    const result = await inspectWorkspace(root);

    expect(codes(result, "SKYN0017")).toBe(1);
  });

  it("fails required auth closed unless handle or the composed handler reads currentUser", async () => {
    const required = readSlice.replace('auth: "anonymous"', 'auth: "required"');
    const invalidRoot = await workspace(moduleFiles(required, readProof));
    const invalid = await inspectWorkspace(invalidRoot);
    expect(codes(invalid, "SKYN0023")).toBe(1);

    const hiddenRead = required.replace(
      "export async function handle(): Promise<void> {}",
      "export async function handle(input: object, currentUser: { id: string }): Promise<void> { function dead(): void { void currentUser.id; } void input; void dead; }",
    );
    const hiddenRoot = await workspace(moduleFiles(hiddenRead, readProof));
    expect(codes(await inspectWorkspace(hiddenRoot), "SKYN0023")).toBe(1);

    const valid = required.replace(
      "export async function handle(): Promise<void> {}",
      "export async function handle(input: object, currentUser: { id: string }): Promise<void> { void input; void currentUser.id; }",
    );
    const validRoot = await workspace(moduleFiles(valid, readProof));
    expect(codes(await inspectWorkspace(validRoot), "SKYN0023")).toBe(0);
  });

  it("accepts one owned declared code used by an Errors factory", async () => {
    const registry = `import { defineErrorCodes } from "@skiesjs/openapi";
export const BillingErrorCodes = defineErrorCodes({ missing: "billing.missing" });
`;
    const slice = readSlice
      .replace('import { defineContract } from "@skiesjs/openapi";', 'import { Errors } from "@skiesjs/core";\nimport { defineContract } from "@skiesjs/openapi";\nimport { BillingErrorCodes } from "./billing.errors.js";')
      .replace("export async function handle(): Promise<void> {}", 'export async function handle(): Promise<void> { void Errors.notFound(BillingErrorCodes.missing, "missing"); }');
    const root = await workspace(moduleFiles(slice, readProof, { "src/modules/billing/billing.errors.ts": registry }));

    expect(codes(await inspectWorkspace(root), "SKYN0019")).toBe(0);
  });

  it("rejects orphan members, duplicate literals, and unresolved factory members", async () => {
    const registry = `import { defineErrorCodes } from "@skiesjs/openapi";
export const BillingErrorCodes = defineErrorCodes({ missing: "billing.same", orphan: "billing.orphan" });
export const OtherErrorCodes = defineErrorCodes({ duplicate: "billing.same" });
`;
    const slice = readSlice
      .replace('import { defineContract } from "@skiesjs/openapi";', 'import { Errors } from "@skiesjs/core";\nimport { defineContract } from "@skiesjs/openapi";\nimport { BillingErrorCodes } from "./billing.errors.js";')
      .replace("export async function handle(): Promise<void> {}", 'export async function handle(): Promise<void> { void Errors.notFound(BillingErrorCodes.unknown, "missing"); }');
    const root = await workspace(moduleFiles(slice, readProof, { "src/modules/billing/billing.errors.ts": registry }));
    const result = await inspectWorkspace(root);

    expect(codes(result, "SKYN0019")).toBeGreaterThanOrEqual(5);
  });

  it("rejects borrowing a registry owned by another module", async () => {
    const registry = `import { defineErrorCodes } from "@skiesjs/openapi";
export const ShippingErrorCodes = defineErrorCodes({ delayed: "shipping.delayed" });
`;
    const slice = readSlice
      .replace('import { defineContract } from "@skiesjs/openapi";', 'import { Errors } from "@skiesjs/core";\nimport { defineContract } from "@skiesjs/openapi";\nimport { ShippingErrorCodes } from "../shipping/shipping.errors.js";')
      .replace("export async function handle(): Promise<void> {}", 'export async function handle(): Promise<void> { void Errors.unavailable(ShippingErrorCodes.delayed, "delayed"); }');
    const root = await workspace({
      ...moduleFiles(slice, readProof),
      "src/modules.ts": `import * as Billing from "./modules/billing/billing.module.js";
import * as Shipping from "./modules/shipping/shipping.module.js";
export function mapModules(app: object): void { Billing.map(app); Shipping.map(app); }
`,
      "src/modules/shipping/shipping.module.ts": `export function map(router: object): void { void router; }\n`,
      "src/modules/shipping/shipping.ctx.md": `## Boundaries\nShipping owns its errors.\n\n## Design notes\nRegistration is explicit.\n`,
      "src/modules/shipping/shipping.errors.ts": registry,
    });

    expect(codes(await inspectWorkspace(root), "SKYN0019")).toBeGreaterThanOrEqual(1);
  });

  it("resolves declared registry references in direct contract metadata", async () => {
    const registry = `import { defineErrorCodes } from "@skiesjs/openapi";
export const BillingErrorCodes = defineErrorCodes({ unavailable: "billing.unavailable" });
`;
    const slice = readSlice
      .replace('import { defineContract } from "@skiesjs/openapi";', 'import { defineContract } from "@skiesjs/openapi";\nimport { BillingErrorCodes } from "./billing.errors.js";')
      .replace("request: {},", "errorCodes: [BillingErrorCodes.unavailable], request: {},");
    const root = await workspace(moduleFiles(slice, readProof, { "src/modules/billing/billing.errors.ts": registry }));

    expect(codes(await inspectWorkspace(root), "SKYN0019")).toBe(0);
  });
});

describe("criterion bijection and omitted tests", () => {
  it("requires a criterion and exactly one attached proof citation", async () => {
    const noCriterionRoot = await workspace(moduleFiles(
      readSlice.replace("// @skies-criterion billing.operation.readable\n", ""),
      readProof,
    ));
    expect(codes(await inspectWorkspace(noCriterionRoot), "SKYN0031")).toBe(1);

    const missingRoot = await workspace(moduleFiles(readSlice, readProof.replace("// @skies-proof billing.operation.readable\n", "")));
    expect(codes(await inspectWorkspace(missingRoot), "SKYN0030")).toBe(1);

    const duplicate = `${readProof}\n// @skies-proof billing.operation.readable\ne2e("also reads", () => { expect(true).toBe(true); });\n`;
    const duplicateRoot = await workspace(moduleFiles(readSlice, duplicate));
    expect(codes(await inspectWorkspace(duplicateRoot), "SKYN0030")).toBe(1);
  });

  it("does not mistake directive-looking string contents for comments", async () => {
    const stringOnlySlice = readSlice.replace(
      "// @skies-criterion billing.operation.readable",
      "const documentation = `// @skies-criterion billing.operation.readable`; void documentation;",
    );
    const stringOnlyProof = readProof.replace(
      "// @skies-proof billing.operation.readable",
      "const documentation = `// @skies-proof billing.operation.readable`; void documentation;",
    );
    const root = await workspace(moduleFiles(stringOnlySlice, stringOnlyProof));
    const result = await inspectWorkspace(root);

    expect(codes(result, "SKYN0031")).toBe(1);
  });

  it("rejects unattached and undeclared proof comments", async () => {
    const proof = readProof
      .replace("// @skies-proof billing.operation.readable\n", "// @skies-proof billing.operation.unknown\nconst notAProof = true;\n")
      .replace("e2e(\"reads\"", "void notAProof;\ne2e(\"reads\"");
    const root = await workspace(moduleFiles(readSlice, proof));

    expect(codes(await inspectWorkspace(root), "SKYN0030")).toBeGreaterThanOrEqual(2);
  });

  it("rejects skipped, todo, conditional, focused, and expected-failure evidence", async () => {
    const proof = `import { it, test } from "vitest";
it.skip("skip", () => undefined);
test.todo("todo", () => undefined);
test.skipIf(false)("conditional skip", () => undefined);
test.todoIf(true)("conditional todo", () => undefined);
test.runIf(true)("conditional run", () => undefined);
test.only("focused", () => undefined);
test.fails("suppressed failure", () => undefined);
`;
    const root = await workspace(moduleFiles(readSlice, proof));
    const result = await inspectWorkspace(root);

    expect(codes(result, "SKYN0032")).toBe(7);
  });
});
