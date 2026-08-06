import type { Method } from "./types.js";

export function sliceSource(name: string, method: Method, route: string, criterion: string): string {
  const write = ["delete", "patch", "post", "put"].includes(method);
  const request = write
    ? 'request: { body: z.object({ message: z.string().trim().min(1) }) },'
    : "request: {},";
  const input = write
    ? 'export interface Input { readonly message: string }'
    : "export type Input = Record<string, never>;";
  const message = write ? "input.message" : JSON.stringify(`${name} is ready`);
  const mapping = write
    ? 'mapSlice(router, openApi, contract, { toInput: ({ body }) => body, handle: execute });'
    : 'mapSlice(router, openApi, contract, { toInput: () => ({}), handle: execute });';
  return `import type { Router } from "express";
import { Result } from "@skiesjs/core";
import { mapSlice } from "@skiesjs/express";
import { defineContract, type OpenApiRegistry } from "@skiesjs/openapi";
import { z } from "zod";

// @skies-criterion ${criterion}
export const contract = defineContract({
  operationId: ${JSON.stringify(name)},
  method: ${JSON.stringify(method)},
  path: ${JSON.stringify(route)},
  auth: "anonymous",
  kind: "app",
  ${request}
  success: {
    status: 200,
    output: z.object({ message: z.string() }),
  },
});

${input}

export interface Output {
  readonly message: string;
}

export async function handle(input: Input): Promise<Result<Output>> {
  return Result.ok({ message: ${message} });
}

export function map(router: Router, openApi: OpenApiRegistry, execute: typeof handle = handle): void {
  ${mapping}
}
`;
}

export function sliceTestSource(
  name: string,
  fileBase: string,
  criterion: string,
  method: Method,
): string {
  const write = ["delete", "patch", "post", "put"].includes(method);
  const input = write ? '{ message: "ready" }' : "{}";
  const proof = write ? "" : `// @skies-proof ${criterion}\n`;
  const expected = write ? "ready" : `${name} is ready`;
  return `import { expect } from "vitest";
import { unit } from "@skiesjs/testing";
import * as ${name} from "./${fileBase}.slice.js";

${proof}unit("returns the runnable scaffold result", async () => {
  const result = await ${name}.handle(${input});

  expect(result).toEqual({ ok: true, value: { message: ${JSON.stringify(expected)} } });
});
`;
}

export function sliceJourneySource(
  name: string,
  fileBase: string,
  method: Method,
  route: string,
  criterion: string,
): string {
  const testRoute = route.replace(/\{[^}]+\}/gu, "test");
  return `import express from "express";
import request from "supertest";
import { expect } from "vitest";
import { createOpenApiRegistry } from "@skiesjs/openapi";
import { journey, JourneyPath } from "@skiesjs/testing";
import * as ${name} from "./${fileBase}.slice.js";

journey(
  { covers: ${JSON.stringify(name)}, path: JourneyPath.Happy, criterion: ${JSON.stringify(criterion)} },
  "accepts valid input through the real HTTP boundary",
  async () => {
    const app = express();
    const router = express.Router();
    let calls = 0;
    app.use(express.json());
    ${name}.map(router, createOpenApiRegistry({ title: "Journey", version: "1" }), async (input) => {
      calls += 1;
      return ${name}.handle(input);
    });
    app.use(router);

    const happyResponse = await request(app).${method}(${JSON.stringify(testRoute)}).send({ message: "ready" });

    expect(happyResponse.status).toBe(200);
    expect(happyResponse.body).toEqual({ message: "ready" });
    expect(calls).toBe(1);
  },
);

journey(
  { covers: ${JSON.stringify(name)}, path: JourneyPath.Sad },
  "rejects invalid input without invoking the command handler",
  async () => {
    const app = express();
    const router = express.Router();
    let calls = 0;
    app.use(express.json());
    ${name}.map(router, createOpenApiRegistry({ title: "Journey", version: "1" }), async (input) => {
      calls += 1;
      return ${name}.handle(input);
    });
    app.use(router);
    const beforeState = calls;

    const sadResponse = await request(app).${method}(${JSON.stringify(testRoute)}).send({ message: "" });
    const afterState = calls;

    expect(sadResponse.status).toBe(400);
    expect(afterState).toEqual(beforeState);
  },
);
`;
}

export function moduleSource(withOpenApi: boolean): string {
  if (!withOpenApi) {
    return `import type { Express } from "express";

export function map(app: Express): void {
  // Register this module's slices explicitly here.
  void app;
}
`;
  }
  return `import { Router, type Express } from "express";
import type { OpenApiRegistry } from "@skiesjs/openapi";

export function map(app: Express, openApi: OpenApiRegistry): void {
  const router = Router();
  // Register this module's slices explicitly on router here.
  void openApi;
  app.use(router);
}
`;
}

export function contextSource(name: string): string {
  return `# ${name}

Describe ${name}'s purpose in one to three lines.

## Boundaries

- **Inside:** Define the behavior and rules owned by ${name}.
- **Outside:** Keep cross-module behavior and shared infrastructure with their owners.

## Design notes

Record non-obvious invariants and why they hold. Replace this scaffold as the design becomes concrete.
`;
}
