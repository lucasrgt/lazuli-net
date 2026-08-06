# Skies Node.js

The Node.js half of Skies: a Rails-minded convention framework for **plain TypeScript + Express 5**. It keeps the
same two laws as Skies .NET:

1. **Stranger-maintainable.** Output is ordinary TypeScript, explicit Express routing, and direct app dependencies.
2. **Doctor-removable.** Remove the ESLint plugin and the app still compiles and runs; only enforcement disappears.

There are no decorators, reflection, controller base classes, DI container, or directory discovery.

## Packages

| Package | Purpose |
|---|---|
| `@skiesjs/core` | HTTP-agnostic `Result<T>`, structured errors, and the closed error catalog. |
| `@skiesjs/express` | Explicit `Result<T>` → Express response mapping. |
| `eslint-plugin-skies-node` | The removable `SKYN####` structural doctor. |
| `@skiesjs/cli` | `skies-node g slice` scaffolding. |

## Canonical slice

```ts
import type { Router } from "express";
import { Result } from "@skiesjs/core";
import { endpoint } from "@skiesjs/express";

export interface Input { readonly invoiceId: string }
export interface Output { readonly invoiceId: string }

export async function handle(input: Input): Promise<Result<Output>> {
  return Result.ok({ invoiceId: input.invoiceId });
}

export function map(router: Router): void {
  router.post("/invoices", endpoint((request) => handle(request.body as Input)));
}
```

The module imports the file explicitly, normally as `import * as CreateInvoice`, and calls `CreateInvoice.map`.
Tests live beside slices as `*.slice.test.ts` and call `handle` directly unless the HTTP boundary is what they prove.

## Develop

```bash
cd node-sdk
npm ci
npm run check
```

Generate a slice:

```bash
npx skies-node g slice Billing CreateInvoice --method post --route /invoices
```

See [`../docs/NODE-CONVENTIONS.md`](../docs/NODE-CONVENTIONS.md) for the shipped constitution and rule catalog.
The live [parity ledger](../docs/NODE-PARITY.md) keeps preview claims honest until every .NET-level outcome is proven.
