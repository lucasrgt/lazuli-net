import path from "node:path";
import { fileURLToPath } from "node:url";
import plugin from "../index.js";
import { canonical, ruleTester } from "./setup.js";

ruleTester.run("slice-shape", plugin.rules["slice-shape"], {
  valid: [
    { filename: "wallet.slice.ts", code: canonical },
    { filename: "ordinary.ts", code: "export const value = 1;" },
  ],
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
    {
      filename: "wallet.slice.ts",
      code: `export function map(router: Router): void { router.get("/", endpoint(() => handle({}))); }`,
    },
    {
      filename: "wallet.slice.ts",
      code: `export function map(router: Router, cache: Cache): void { cache.get("key"); router.get("/", endpoint(() => handle({}))); }`,
    },
    { filename: "ordinary.ts", code: `router.get("/", async () => ({}));` },
  ],
  invalid: [
    {
      filename: "wallet.slice.ts",
      code: `export function map(router: Router): void { router.get("/:id", async () => ({ id: "1" })); }`,
      errors: [{ messageId: "inline" }],
    },
    {
      filename: "wallet.slice.ts",
      code: `export function map(router: Router): void { router["post"]("/", handler); }`,
      errors: [{ messageId: "inline" }],
    },
  ],
});

const directory = path.dirname(fileURLToPath(import.meta.url));
const slice = path.join(directory, "inventory", "health.slice.ts");
const test = path.join(directory, "inventory", "health.slice.test.ts");
ruleTester.run("require-slice-test", plugin.rules["require-slice-test"], {
  valid: [
    { filename: slice, code: canonical, options: [{ testFiles: [test] }] },
    { filename: slice, code: canonical },
    {
      filename: slice,
      code: canonical,
      settings: { "skies-node": { testFiles: [test.replaceAll("/", "\\")] } },
    },
  ],
  invalid: [
    {
      filename: slice,
      code: canonical,
      options: [{ testFiles: [] }],
      errors: [{ messageId: "missing", data: { test: "health.slice.test.ts" } }],
    },
  ],
});
