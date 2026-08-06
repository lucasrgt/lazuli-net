import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import plugin from "./index.js";
import manifest from "./package.json" with { type: "json" };

assert.equal(plugin.meta.version, manifest.version);

const directory = path.dirname(fileURLToPath(import.meta.url));
const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { range: true },
  },
});

const canonical = `
  export interface Input { id: string }
  export interface Output { id: string }
  export async function handle(input: Input): Promise<Result<Output>> { return Result.ok(input); }
  export function map(router: Router): void { router.get("/:id", endpoint(() => handle({ id: "1" }))); }
`;

ruleTester.run("slice-shape", plugin.rules["slice-shape"], {
  valid: [{ filename: "wallet.slice.ts", code: canonical }],
  invalid: [
    {
      filename: "wallet.slice.ts",
      code: `export interface Input {}
export async function handle(input: Input): Promise<Result<Output>> { return Result.ok(input); }`,
      errors: [{ messageId: "missing" }, { messageId: "missing" }],
    },
    {
      filename: "wallet.slice.ts",
      code: `
        export interface Output { id: string }
        export interface Input { id: string }
        export function handle(input: Input): Result<Output> { return Result.ok(input); }
        export async function map(router: Router): Promise<void> {}
      `,
      errors: [
        { messageId: "order" },
        { messageId: "handleAsync" },
        { messageId: "handleSignature" },
        { messageId: "mapSignature" },
      ],
    },
  ],
});

ruleTester.run("thin-map", plugin.rules["thin-map"], {
  valid: [
    { filename: "wallet.slice.ts", code: canonical },
    {
      filename: "wallet.slice.ts",
      code: `export function map(router: Router, cache: Cache): void { cache.get("key"); router.get("/", endpoint(() => handle({}))); }`,
    },
  ],
  invalid: [
    {
      filename: "wallet.slice.ts",
      code: `export function map(router: Router): void { router.get("/:id", async (_request) => ({ id: "1" })); }`,
      errors: [{ messageId: "inline" }],
    },
  ],
});

ruleTester.run("require-slice-test", plugin.rules["require-slice-test"], {
  valid: [
    {
      filename: path.join(directory, "fixtures", "with-test", "health.slice.ts"),
      code: canonical,
    },
  ],
  invalid: [
    {
      filename: path.join(directory, "fixtures", "without-test", "health.slice.ts"),
      code: canonical,
      errors: [{ messageId: "missing", data: { test: "health.slice.test.ts" } }],
    },
  ],
});
