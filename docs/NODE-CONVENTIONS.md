# Skies Node.js — Conventions & Constitution

Skies Node.js carries the Rails mindset into ordinary TypeScript and Express. Its gift is a conventional vertical
slice, a generator, and a removable doctor—not a runtime that owns the application.

## The two laws

1. **Stranger-maintainable.** A TypeScript developer who has never used Skies can read and change the generated
   application. Use ordinary ES modules, explicit Express routers, and direct app dependencies.
2. **Doctor-removable.** Removing `eslint-plugin-skies-node` changes no runtime behavior. It only removes structural
   enforcement.

Decorators, reflection, automatic directory discovery, base controllers, hidden source generation, and a framework
DI container are outside the boundary.

## Slice convention

One operation is one `*.slice.ts` file. It exports this visible spine in order:

```ts
import type { Router } from "express";
import { Result } from "@skiesjs/core";
import { endpoint } from "@skiesjs/express";

export interface Input { readonly invoiceId: string }
export interface Output { readonly invoiceId: string }

export async function handle(input: Input): Promise<Result<Output>> {
  // Validate at the top, use the app's DB client directly, and return expected failures.
  return Result.ok({ invoiceId: input.invoiceId });
}

export function map(router: Router): void {
  router.post("/invoices", endpoint((request) => handle(request.body as Input)));
}
```

- `handle` is HTTP-agnostic. It does not accept or return Express types.
- Expected domain failures use `Result.fail`; thrown exceptions remain unexpected and travel through Express's error
  pipeline.
- An error has a closed `kind`, a stable namespaced `code`, and a developer-facing English `message`. User copy is
  localized by the client from the code.
- `map` contains transport adaptation only. The `endpoint` adapter performs the one canonical result-to-status mapping.
- Modules import slices and register them explicitly. No glob or reflection discovers routes.
- Tests live next to their slice as `*.slice.test.ts` and call `handle` directly. Use Supertest only when routing,
  binding, or HTTP mapping is the behavior under proof.

The initial conventional location is:

```text
src/modules/<module>/slices/<operation>.slice.ts
src/modules/<module>/slices/<operation>.slice.test.ts
```

## Error-to-HTTP mapping

| Kind | Status |
|---|---:|
| `Validation` | 400 |
| `Unauthorized` | 401 |
| `Forbidden` | 403 |
| `NotFound` | 404 |
| `Conflict` | 409 |
| `BusinessRule` | 422 |
| `RateLimit` | 429 |
| `Internal` | 500 |
| `Unavailable` | 503 |

## Doctor catalog

The first milestone deliberately ships only rules backed by the existing Skies slice discipline.

| Rule | Enforces |
|---|---|
| `SKYN0001` (`slice-shape`) | A slice exports `Input`, `Output`, async `handle(input: Input): Promise<Result<Output>>`, and synchronous `map(router: Router): void`, in order. |
| `SKYN0002` (`thin-map`) | Express routes inside `map` use the canonical `endpoint(...)` boundary instead of an inline behavior block. |
| `SKYN0003` (`require-slice-test`) | Every `*.slice.ts` has a sibling `*.slice.test.ts`. |

New rules require observed drift. OpenAPI, schema validation, persistence conventions, auth posture, AVP, and write
journeys remain planned work rather than speculative milestone-one machinery.
