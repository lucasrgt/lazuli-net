import plugin from "../index.js";
import { ruleTester } from "./setup.js";

ruleTester.run("error-code-registry", plugin.rules["error-code-registry"], {
  valid: [
    {
      filename: "/app/src/modules/wallet/wallet.errors.ts",
      code: `import { defineErrorCodes } from "@skiesjs/openapi";
export const WalletErrorCodes = defineErrorCodes({ notFound: "wallet.not_found", invalidId: "wallet.id.invalid" });`,
    },
    {
      filename: "/app/src/modules/wallet/wallet.errors.ts",
      code: `import * as OpenApi from "@skiesjs/openapi";
export const WalletErrorCodes = OpenApi.defineErrorCodes({ notFound: "wallet.not_found" } as const);`,
    },
    {
      filename: "/app/src/modules/wallet/get.slice.ts",
      code: `import { Errors } from "@skiesjs/core";
const error = Errors.notFound(WalletErrorCodes.notFound, "not found");
const fields = Errors.validation([{ field: "id", code: WalletErrorCodes.invalidId, message: "invalid" }]);
const aggregate = Errors.validation(existingFields);`,
    },
    {
      filename: "/app/src/modules/wallet/get.slice.ts",
      code: `import { Errors as Failure } from "@skiesjs/core";
const error = Failure.conflict(WalletErrorCodes.conflict, "conflict");`,
    },
    {
      filename: "/repo/node-sdk/packages/core/src/index.test.ts",
      code: `const error = Errors.notFound("wallet.not_found", "not found");`,
    },
    {
      filename: "/app/src/config.ts",
      code: `const domain = "example.com"; const currency = { code: "USD" };`,
    },
  ],
  invalid: [
    {
      filename: "/app/src/modules/wallet/get.slice.ts",
      code: `const WalletErrorCodes = defineErrorCodes({ notFound: "wallet.not_found" });`,
      errors: [{ messageId: "wrongFile" }],
    },
    {
      filename: "/app/src/modules/wallet/wallet.errors.ts",
      code: `const WalletErrorCodes = defineErrorCodes(codes);`,
      errors: [{ messageId: "registryShape" }],
    },
    {
      filename: "/app/src/modules/wallet/wallet.errors.ts",
      code: `const WalletErrorCodes = defineErrorCodes({ notFound: makeCode(), ...otherCodes });`,
      errors: [{ messageId: "registryShape" }, { messageId: "registryShape" }],
    },
    {
      filename: "/app/src/modules/wallet/get.slice.ts",
      code: `const error = Errors.notFound("wallet.not_found", "not found");`,
      errors: [{ messageId: "factory" }],
    },
    {
      filename: "/app/src/modules/wallet/get.slice.ts",
      code: `const code = WalletErrorCodes.notFound; const error = Errors.notFound(code, "not found");`,
      errors: [{ messageId: "factory" }],
    },
    {
      filename: "/app/src/modules/wallet/get.slice.ts",
      code: `const error = Errors.validation([{ field: "id", code: "wallet.id.invalid", message: "invalid" }]);`,
      errors: [{ messageId: "factory" }],
    },
    {
      filename: "/app/src/modules/wallet/get.slice.ts",
      code: `const notFoundCode = "wallet.not_found";`,
      errors: [{ messageId: "literal" }],
    },
    {
      filename: "/app/src/modules/wallet/wallet.errors.ts",
      code: `const WalletErrorCodes = { notFound: "wallet.not_found" };`,
      errors: [{ messageId: "literal" }],
    },
    {
      filename: "/app/src/modules/wallet/get.slice.ts",
      code: `const response = { code: "wallet.not_found" };`,
      errors: [{ messageId: "literal" }],
    },
  ],
});
