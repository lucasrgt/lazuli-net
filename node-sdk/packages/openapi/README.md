# @skiesjs/openapi

Express-free, explicit HTTP contracts for Skies Node.js. The package uses Zod 4 schemas for runtime-compatible request
and response shapes and projects an explicitly populated registry to deterministic OpenAPI 3.1 JSON. It does not use
decorators, reflection, route discovery, or dependency injection.

## Define a contract

```ts
import { z } from "zod";
import {
  createOpenApiDocument,
  createOpenApiRegistry,
  defineContract,
  defineErrorCodes,
} from "@skiesjs/openapi";

export const WalletErrorCodes = defineErrorCodes({
  notFound: "wallets.not_found",
  invalidId: "wallet.id.invalid",
});

export const createWalletContract = defineContract({
  operationId: "CreateWallet", // explicit, stable, and unique
  method: "post",
  path: "/wallets/{walletId}",
  auth: "required",            // `required` or `anonymous`; omission is a type error
  kind: "app",                 // `app`, `asset`, `webhook`, or `internal`
  request: {
    params: z.object({ walletId: z.string().uuid() }),
    query: z.object({ notify: z.stringbool().optional() }),
    headers: z.object({ "idempotency-key": z.string() }),
    body: z.object({ openingBalance: z.number().nonnegative() }),
  },
  success: {
    status: 201,
    output: z.object({ walletId: z.string(), balance: z.number() }),
  },
});

const registry = createOpenApiRegistry({ title: "Wallet API", version: "1.0.0" });
registry.registerErrorCodes(WalletErrorCodes);
registry.registerContract(createWalletContract);
const document = createOpenApiDocument(registry);
```

`ErrorBody.code` is the sorted, distinct union of the live registries at generation time. Every operation declares all
nine canonical error statuses. Route and operation-ID collisions fail at explicit registration. The complete document
marks operations with `x-skies-endpoint-kind`, `x-skies-auth-posture`, and `x-skies-app-client-excluded`.
`createOpenApiDocument(registry, { audience: "app-client" })` physically excludes asset, webhook, and internal
operations and their schemas from an application-client contract.

`@skiesjs/express` normally owns contract registration through `mapSlice`, so an application should not also call
`registry.registerContract` for the same route.
