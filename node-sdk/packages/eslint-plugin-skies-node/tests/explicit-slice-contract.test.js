import plugin from "../index.js";
import { ruleTester } from "./setup.js";

const contract = `const contract = defineContract({
  auth: "required",
  kind: "app",
});`;

ruleTester.run("explicit-slice-contract", plugin.rules["explicit-slice-contract"], {
  valid: [
    {
      filename: "wallet.slice.ts",
      code: `${contract}
export function map(router: Router): void { mapSlice(router, openApi, contract, { toInput, handle }); }`,
    },
    {
      filename: "wallet.slice.ts",
      code: `import { defineContract as contractFor } from "@skiesjs/openapi";
import { mapSlice as mountSlice } from "@skiesjs/express";
const contract = contractFor({ auth: "anonymous" as const, kind: "internal" as const });
export function map(router: Router): void { mountSlice(router, openApi, contract, { toInput, handle }); }`,
    },
    {
      filename: "wallet.slice.ts",
      code: `import * as OpenApi from "@skiesjs/openapi";
import * as SkiesExpress from "@skiesjs/express";
const contract = OpenApi.defineContract({ auth: "anonymous", kind: "webhook" });
export function map(router: Router): void { SkiesExpress.mapSlice(router, openApi, contract, mapping); }`,
    },
    {
      filename: "wallet.slice.ts",
      code: `const contract = defineContract({ auth: "runtime-validates-this", kind: "future-kind" });
export function map(router: Router): void { mapSlice(router, openApi, contract, mapping); }`,
    },
    {
      filename: "router.ts",
      code: `router.get("/legacy", endpoint(handler));`,
    },
    {
      filename: "wallet.slice.test.ts",
      code: `router.get("/fixture", endpoint(handler));`,
    },
  ],
  invalid: [
    {
      filename: "wallet.slice.ts",
      code: `export function map(router: Router): void { mapSlice(router, openApi, contract, mapping); }`,
      errors: [{ messageId: "contractMissing" }],
    },
    {
      filename: "wallet.slice.ts",
      code: `${contract}
export function map(router: Router): void { void router; }`,
      errors: [{ messageId: "mappingMissing" }],
    },
    {
      filename: "wallet.slice.ts",
      code: `${contract}
export function map(router: Router): void {
  router.get("/wallets", endpoint(handler));
  mapSlice(router, openApi, contract, mapping);
}`,
      errors: [{ messageId: "rawRoute" }],
    },
    {
      filename: "wallet.slice.ts",
      code: `${contract}
export function map(router: Router): void {
  const handler = endpoint(handle);
  mapSlice(router, openApi, contract, mapping);
}`,
      errors: [{ messageId: "rawEndpoint" }],
    },
    {
      filename: "wallet.slice.ts",
      code: `const contract = defineContract({ request: {}, success: response });
export function map(router: Router): void { mapSlice(router, openApi, contract, mapping); }`,
      errors: [{ messageId: "authMissing" }, { messageId: "kindMissing" }],
    },
    {
      filename: "wallet.slice.ts",
      code: `const contract = defineContract({ auth: posture, kind });
export function map(router: Router): void { mapSlice(router, openApi, contract, mapping); }`,
      errors: [{ messageId: "authLiteral" }, { messageId: "kindLiteral" }],
    },
    {
      filename: "wallet.slice.ts",
      code: `const contract = defineContract(options);
export function map(router: Router): void { mapSlice(router, openApi, contract, mapping); }`,
      errors: [{ messageId: "authLiteral" }, { messageId: "kindLiteral" }],
    },
    {
      filename: "wallet.slice.ts",
      code: `${contract}
export function map(router: Router): void {
  router.route("/wallets").post(handler);
  mapSlice(router, openApi, contract, mapping);
}`,
      errors: [{ messageId: "rawRoute" }],
    },
  ],
});
