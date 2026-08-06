# @skiesjs/express

The explicit Express 5 boundary for Skies slices. The existing `endpoint` adapter maps `Result<T>` to JSON and the
nine canonical status codes; unexpected exceptions continue through the application's normal Express error middleware.

`mapSlice` pairs an explicit `@skiesjs/openapi` contract with a visible transport-to-`Input` mapper and an
HTTP-agnostic handler. There is no decorator, discovery pass, generated behavior, or hidden dependency injection.

```ts
import type { RequestHandler, Router } from "express";
import { Result } from "@skiesjs/core";
import { defineContract, type OpenApiRegistry } from "@skiesjs/openapi";
import { mapSlice } from "@skiesjs/express";
import { z } from "zod";

export interface Input { readonly walletId: string; readonly amount: number }
export interface Output { readonly walletId: string; readonly amount: number }

export const contract = defineContract({
  operationId: "FundWallet",
  method: "post",
  path: "/wallets/{walletId}/fund",
  auth: "required",
  kind: "app",
  request: {
    params: z.object({ walletId: z.string().uuid() }),
    body: z.object({ amount: z.number().positive() }),
  },
  success: {
    status: 200,
    output: z.object({ walletId: z.string(), amount: z.number() }),
  },
});

export async function handle(input: Input): Promise<Result<Output>> {
  return Result.ok({ walletId: input.walletId, amount: input.amount });
}

export function map(router: Router, openApi: OpenApiRegistry, authorize: RequestHandler): void {
  mapSlice(router, openApi, contract, {
    // Required auth is real middleware, not documentation-only metadata.
    authorize,
    // The application-owned Input mapping stays visible and type checked.
    toInput: ({ body, params }) => ({ walletId: params.walletId, amount: body.amount }),
    handle,
  });
}
```

Each declared request part is parsed independently. Zod issues are accumulated into the stable Skies validation
envelope with fields such as `body.amount` and codes such as `validation.invalid_type` before the slice handler runs.

Serve the live registry explicitly from the composition root:

```ts
import express from "express";
import { createOpenApiRegistry } from "@skiesjs/openapi";
import { serveOpenApi } from "@skiesjs/express";

const openApi = createOpenApiRegistry({ title: "Wallet API", version: "1.0.0" });
const router = express.Router();
// Each module receives `openApi` and calls its slices' explicit map functions.
router.get("/openapi/v1.json", serveOpenApi(openApi));
```

Use `serveOpenApi(openApi, { audience: "app-client" })` for a client-generation document that excludes asset,
webhook, and internal endpoints.
