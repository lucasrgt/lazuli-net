type CrudKind = "create" | "get" | "list" | "update" | "delete";

function operationName(kind: CrudKind, name: string): string {
  return `${kind[0]!.toUpperCase()}${kind.slice(1)}${name}`;
}

export function crudSliceSource(input: {
  readonly kind: CrudKind;
  readonly name: string;
  readonly variable: string;
  readonly fileBase: string;
  readonly route: string;
  readonly criterion: string;
}): string {
  const { kind, name, variable, fileBase, route, criterion } = input;
  const operation = operationName(kind, name);
  const imports = `import type { Router } from "express";
import type { Result } from "@skiesjs/core";
import { mapSlice } from "@skiesjs/express";
import { defineContract, type OpenApiRegistry } from "@skiesjs/openapi";
import { z } from "zod";
import { unconfigured${name}Queries, type ${name}Queries, type ${name}View } from "../queries/${fileBase}.queries.js";
${kind === "list" ? "" : `import { ${variable}IdSchema, type ${name}Id } from "../values/${fileBase}-id.js";\n`}`;
  const viewSchema = `const viewSchema = z.object({
  id: z.string().uuid(), orgId: z.string().uuid(), version: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});`;
  const criterionTag = `\n// @skies-criterion ${criterion}`;
  if (kind === "create") return `${imports}\n${viewSchema}${criterionTag}
export const contract = defineContract({
  operationId: "${operation}", method: "post", path: "${route}", auth: "anonymous", kind: "app",
  request: { body: z.object({ id: ${variable}IdSchema, orgId: z.string().uuid() }) },
  success: { status: 201, output: viewSchema },
});

export interface Input { readonly id: ${name}Id; readonly orgId: string }
export type Output = ${name}View;
export async function handle(input: Input, queries: ${name}Queries = unconfigured${name}Queries): Promise<Result<Output>> {
  return queries.create(input);
}
export function map(router: Router, openApi: OpenApiRegistry, queries: ${name}Queries = unconfigured${name}Queries): void {
  mapSlice(router, openApi, contract, { toInput: ({ body }) => body, handle: (value) => handle(value, queries) });
}
`;
  if (kind === "get") return `${imports}\n${viewSchema}${criterionTag}
export const contract = defineContract({
  operationId: "${operation}", method: "get", path: "${route}/{${variable}Id}", auth: "anonymous", kind: "app",
  request: { params: z.object({ ${variable}Id: ${variable}IdSchema }), query: z.object({ orgId: z.string().uuid() }) },
  success: { status: 200, output: viewSchema },
});

export interface Input { readonly id: ${name}Id; readonly orgId: string }
export type Output = ${name}View;
export async function handle(input: Input, queries: ${name}Queries = unconfigured${name}Queries): Promise<Result<Output>> {
  return queries.get(input);
}
export function map(router: Router, openApi: OpenApiRegistry, queries: ${name}Queries = unconfigured${name}Queries): void {
  mapSlice(router, openApi, contract, {
    toInput: ({ params, query }) => ({ id: params.${variable}Id, orgId: query.orgId }),
    handle: (value) => handle(value, queries),
  });
}
`;
  if (kind === "list") return `${imports}\n${viewSchema}${criterionTag}
export const contract = defineContract({
  operationId: "${operation}", method: "get", path: "${route}", auth: "anonymous", kind: "app",
  request: { query: z.object({
    orgId: z.string().uuid(), pageNumber: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  }) },
  success: { status: 200, output: z.object({
    items: z.array(viewSchema), totalCount: z.number().int().nonnegative(),
    pageNumber: z.number().int().positive(), pageSize: z.number().int().positive(),
  }) },
});

export interface Input { readonly orgId: string; readonly pageNumber: number; readonly pageSize: number }
export interface Output {
  readonly items: ${name}View[]; readonly totalCount: number;
  readonly pageNumber: number; readonly pageSize: number;
}
export async function handle(input: Input, queries: ${name}Queries = unconfigured${name}Queries): Promise<Result<Output>> {
  const result = await queries.list(input);
  return result.ok ? { ok: true, value: { ...result.value, items: [...result.value.items] } } : result;
}
export function map(router: Router, openApi: OpenApiRegistry, queries: ${name}Queries = unconfigured${name}Queries): void {
  mapSlice(router, openApi, contract, { toInput: ({ query }) => query, handle: (value) => handle(value, queries) });
}
`;
  if (kind === "update") return `${imports}\n${viewSchema}${criterionTag}
export const contract = defineContract({
  operationId: "${operation}", method: "put", path: "${route}/{${variable}Id}", auth: "anonymous", kind: "app",
  request: {
    params: z.object({ ${variable}Id: ${variable}IdSchema }), query: z.object({ orgId: z.string().uuid() }),
    body: z.object({ expectedVersion: z.number().int().nonnegative() }),
  },
  success: { status: 200, output: viewSchema },
});

export interface Input { readonly id: ${name}Id; readonly orgId: string; readonly expectedVersion: number }
export type Output = ${name}View;
export async function handle(input: Input, queries: ${name}Queries = unconfigured${name}Queries): Promise<Result<Output>> {
  return queries.update(input);
}
export function map(router: Router, openApi: OpenApiRegistry, queries: ${name}Queries = unconfigured${name}Queries): void {
  mapSlice(router, openApi, contract, {
    toInput: ({ params, query, body }) => ({ id: params.${variable}Id, orgId: query.orgId, ...body }),
    handle: (value) => handle(value, queries),
  });
}
`;
  return `${imports}${criterionTag}
export const contract = defineContract({
  operationId: "${operation}", method: "delete", path: "${route}/{${variable}Id}", auth: "anonymous", kind: "app",
  request: {
    params: z.object({ ${variable}Id: ${variable}IdSchema }), query: z.object({ orgId: z.string().uuid() }),
    body: z.object({ expectedVersion: z.number().int().nonnegative() }),
  },
  success: { status: 200, output: z.object({ deleted: z.literal(true) }) },
});

export interface Input { readonly id: ${name}Id; readonly orgId: string; readonly expectedVersion: number }
export interface Output { readonly deleted: true }
export async function handle(input: Input, queries: ${name}Queries = unconfigured${name}Queries): Promise<Result<Output>> {
  return queries.delete(input);
}
export function map(router: Router, openApi: OpenApiRegistry, queries: ${name}Queries = unconfigured${name}Queries): void {
  mapSlice(router, openApi, contract, {
    toInput: ({ params, query, body }) => ({ id: params.${variable}Id, orgId: query.orgId, ...body }),
    handle: (value) => handle(value, queries),
  });
}
`;
}

export function crudTestSource(name: string, variable: string, fileBase: string): string {
  return `import { describe, expect, it } from "vitest";
import * as Create from "./create-${fileBase}.slice.js";
import * as Delete from "./delete-${fileBase}.slice.js";
import * as Get from "./get-${fileBase}.slice.js";
import * as List from "./list-${fileBase}.slice.js";
import * as Update from "./update-${fileBase}.slice.js";
import { ${name}ErrorCodes } from "../${fileBase}.errors.js";
import { ${variable}IdCodec, ${name}Id } from "../values/${fileBase}-id.js";

describe("${name} CRUD surface", () => {
  it("declares all five explicit HTTP contracts", () => {
    expect([Create.contract.method, Get.contract.method, List.contract.method, Update.contract.method, Delete.contract.method])
      .toEqual(["post", "get", "get", "put", "delete"]);
    expect(new Set([Create.contract.operationId, Get.contract.operationId, List.contract.operationId,
      Update.contract.operationId, Delete.contract.operationId]).size).toBe(5);
  });

  it("uses one authoritative scalar UUID codec", () => {
    const valid = ${name}Id.from("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(${variable}IdCodec.encode(valid.value)).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const invalid = ${name}Id.from("not-a-uuid");
    expect(invalid).toMatchObject({ ok: false, error: { code: ${name}ErrorCodes.invalidId } });
  });
});
`;
}

export function crudJourneySource(name: string, variable: string, fileBase: string, route: string, criterion: string): string {
  return `import express from "express";
import request from "supertest";
import { Errors, Result } from "@skiesjs/core";
import { createOpenApiRegistry } from "@skiesjs/openapi";
import { expect } from "vitest";
import { journey, JourneyPath } from "@skiesjs/testing";
import { ${name}ErrorCodes } from "../${fileBase}.errors.js";
import type { ${name}Queries, ${name}View } from "../queries/${fileBase}.queries.js";
import * as Create from "./create-${fileBase}.slice.js";
import * as Delete from "./delete-${fileBase}.slice.js";
import * as Update from "./update-${fileBase}.slice.js";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orgId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = "2030-01-01T00:00:00.000Z";

function fixture(): { readonly app: express.Express; readonly calls: string[] } {
  const calls: string[] = [];
  const entity = (version: number): ${name}View => ({ id, orgId, version, createdAt: now, updatedAt: now });
  const queries: ${name}Queries = {
    create: async () => { calls.push("create"); return Result.ok(entity(0)); },
    get: async () => Result.ok(entity(0)),
    list: async () => Result.ok({ items: [entity(0)], totalCount: 1, pageNumber: 1, pageSize: 20 }),
    update: async (input) => {
      calls.push("update");
      return input.expectedVersion === 0 ? Result.ok(entity(1)) : Result.fail(Errors.conflict(
        ${name}ErrorCodes.versionConflict, "stale ${fileBase}",
      ));
    },
    delete: async () => { calls.push("delete"); return Result.ok({ deleted: true }); },
  };
  const app = express();
  const router = express.Router();
  const registry = createOpenApiRegistry({ title: "CRUD journey", version: "1" });
  app.use(express.json());
  Create.map(router, registry, queries);
  Update.map(router, registry, queries);
  Delete.map(router, registry, queries);
  app.use(router);
  return { app, calls };
}

journey(
  { covers: "${name}Writes", path: JourneyPath.Happy, criterion: ${JSON.stringify(criterion)} },
  "creates, version-updates, and deletes through real HTTP mappings",
  async () => {
    const { app, calls } = fixture();
    const created = await request(app).post(${JSON.stringify(route)}).send({ id, orgId });
    const updated = await request(app).put(\`${route}/\${id}?orgId=\${orgId}\`).send({ expectedVersion: 0 });
    const deleted = await request(app).delete(\`${route}/\${id}?orgId=\${orgId}\`).send({ expectedVersion: 1 });

    expect([created.status, updated.status, deleted.status]).toEqual([201, 200, 200]);
    expect(calls).toEqual(["create", "update", "delete"]);
  },
);

journey(
  { covers: "${name}Writes", path: JourneyPath.Sad },
  "rejects invalid input and exposes stable optimistic-concurrency conflict",
  async () => {
    const { app, calls } = fixture();
    const invalid = await request(app).put(\`${route}/not-a-uuid?orgId=\${orgId}\`).send({ expectedVersion: 0 });
    const conflict = await request(app).put(\`${route}/\${id}?orgId=\${orgId}\`).send({ expectedVersion: 9 });

    expect(invalid.status).toBe(400);
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe(${name}ErrorCodes.versionConflict);
    expect(calls).toEqual(["update"]);
  },
);
`;
}


export function crudSliceTestSource(input: {
  readonly kind: CrudKind; readonly name: string; readonly fileBase: string; readonly criterion: string;
}): string {
  const operation = operationName(input.kind, input.name);
  const proof = input.kind === "get" || input.kind === "list" ? `// @skies-proof ${input.criterion}\n` : "";
  return `import { expect } from "vitest";
import { unit } from "@skiesjs/testing";
import * as Slice from "./${input.kind}-${input.fileBase}.slice.js";

${proof}unit("exports the explicit ${operation} contract", () => {
  expect(Slice.contract.operationId).toBe(${JSON.stringify(operation)});
  expect(Slice.contract.auth).toBe("anonymous");
  expect(Slice.map).toBeTypeOf("function");
});
`;
}

export function crudWriteJourneySource(input: {
  readonly kind: "create" | "update" | "delete";
  readonly name: string;
  readonly variable: string;
  readonly fileBase: string;
  readonly route: string;
  readonly criterion: string;
}): string {
  const { kind, name, fileBase, route, criterion } = input;
  const operation = operationName(kind, name);
  const method = kind === "create" ? "post" : kind === "update" ? "put" : "delete";
  const requestPath = kind === "create" ? JSON.stringify(route) : `\`${route}/\${id}?orgId=\${orgId}\``;
  const body = kind === "create" ? "{ id, orgId }" : "{ expectedVersion: 0 }";
  const success = kind === "create" ? 201 : 200;
  const result = kind === "delete" ? "Result.ok({ deleted: true as const })" : `Result.ok(entity(${kind === "update" ? 1 : 0}))`;
  const invalidPath = kind === "create" ? JSON.stringify(route) : `\`${route}/not-a-uuid?orgId=\${orgId}\``;
  const invalidBody = kind === "create" ? "{ id: \"not-a-uuid\", orgId }" : body;
  return `import express from "express";
import request from "supertest";
import { Result } from "@skiesjs/core";
import { createOpenApiRegistry } from "@skiesjs/openapi";
import { expect } from "vitest";
import { journey, JourneyPath } from "@skiesjs/testing";
import { unconfigured${name}Queries, type ${name}Queries, type ${name}View } from "../queries/${fileBase}.queries.js";
import * as Slice from "./${kind}-${fileBase}.slice.js";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orgId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = "2030-01-01T00:00:00.000Z";
const entity = (version: number): ${name}View => ({ id, orgId, version, createdAt: now, updatedAt: now });

function fixture() {
  let calls = 0;
  const queries: ${name}Queries = {
    ...unconfigured${name}Queries,
    ${kind}: async () => { calls += 1; return ${result}; },
  };
  const app = express();
  const router = express.Router();
  app.use(express.json());
  Slice.map(router, createOpenApiRegistry({ title: "${operation} journey", version: "1" }), queries);
  app.use(router);
  return { app, calls: () => calls };
}

journey(
  { covers: ${JSON.stringify(operation)}, path: JourneyPath.Happy, criterion: ${JSON.stringify(criterion)} },
  "accepts valid input through the real HTTP mapping",
  async () => {
    const test = fixture();
    const happyResponse = await request(test.app).${method}(${requestPath}).send(${body});
    expect(happyResponse.status).toBe(${success});
    expect(test.calls()).toBe(1);
  },
);

journey(
  { covers: ${JSON.stringify(operation)}, path: JourneyPath.Sad },
  "rejects invalid input without performing the write",
  async () => {
    const test = fixture();
    const beforeState = test.calls();
    const sadResponse = await request(test.app).${method}(${invalidPath}).send(${invalidBody});
    const afterState = test.calls();
    expect(sadResponse.status).toBe(400);
    expect(afterState).toEqual(beforeState);
  },
);
`;
}
