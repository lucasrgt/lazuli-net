# Skies Node.js — conventions and constitution

Skies brings the Rails mindset to ordinary TypeScript and Express 5: one obvious operation shape, explicit
composition, executable contracts, and removable enforcement. Node 24, ESM, strict `NodeNext`, Zod 4, Vitest,
Drizzle, and PostgreSQL are the reference stack.

## Laws

1. **Stranger-maintainable.** Use ordinary modules, direct dependencies, explicit routers and visible callback seams.
2. **Doctor-removable.** Removing ESLint, `@skiesjs/doctor`, and `@skiesjs/foundation` removes enforcement only. The
   application still compiles and behaves identically.

No decorators, reflection discovery, base controllers, hidden DI container, source-generated behavior, or generic ORM
facade is permitted.

## Contract-backed slices

One operation is one `*.slice.ts`, explicitly imported and mapped by its owning `*.module.ts`.

```ts
import type { Router } from "express";
import { Result } from "@skiesjs/core";
import { mapSlice } from "@skiesjs/express";
import { defineContract, type OpenApiRegistry } from "@skiesjs/openapi";
import { z } from "zod";

// @skies-criterion invoices.create.ready
export const contract = defineContract({
  operationId: "Invoices.Create",
  method: "post",
  path: "/invoices",
  auth: "anonymous",
  kind: "app",
  request: { body: z.object({ customerId: z.uuid() }) },
  success: { status: 201, output: z.object({ invoiceId: z.uuid() }) },
});

export interface Input { readonly customerId: string }
export interface Output { readonly invoiceId: string }

export async function handle(input: Input): Promise<Result<Output>> {
  return Result.ok({ invoiceId: input.customerId });
}

export function map(router: Router, openApi: OpenApiRegistry): void {
  mapSlice(router, openApi, contract, { toInput: ({ body }) => body, handle });
}
```

`handle` stays HTTP-agnostic. Expected failures are `Result.fail`; unexpected exceptions reach Express error
middleware. Wire schemas and domain values stay distinct: a `scalarCodec` is adapted through `scalarSchema`, so Zod
decodes primitive input and encodes domain output. `mapSlice` validates every declared request part, emits the one
canonical error envelope, registers live OpenAPI, and refuses a required-auth contract without real middleware.

A protected map reads the verified identity only at this explicit boundary and passes portable values to `handle`:

```ts
mapSlice(router, openApi, contract, {
  authorize: requireJwt(tokens),
  toInput: ({ query }) => query,
  handle: (input, { response }) => handle(input, currentUser(response), query),
});
```

## Composition, context, and evidence

`src/modules.ts` namespace-imports each module and calls its synchronous typed `map`. Each module does the same for
its slices and has an exact sibling `*.ctx.md` with nonempty `## Boundaries` and `## Design notes`. Inline backtick
citations in that context must resolve inside the module.

Every slice declares a stable `// @skies-criterion <id>`. A read criterion has exactly one immediately attached
`// @skies-proof <id>` before a direct `unit`, `integration`, `e2e`, or `journey` call from `@skiesjs/testing`. A
POST/PUT/PATCH/DELETE also has one exact co-located `*.slice.journey.ts` with one happy and one sad static journey.
Both assert an observable HTTP response; the sad path also proves state did not change. `.skip`, `.todo`, and
unconditionally disabled tests are never evidence. Tests/proofs remain under `src` and are collected by Vitest.

Stable application error codes are declared only by `defineErrorCodes` in `*.errors.ts`, consumed through direct
registry members, registered with OpenAPI, unique, and non-orphan. Error kinds map to 400, 401, 403, 404, 409, 422,
429, 500, and 503 respectively.

## PostgreSQL convention

There is no repository or unit-of-work layer. Application code owns its Drizzle tables, filters, transactions, and
pools. `pagePolicy` names the owning context and filtered set and requires the last order column to be a unique
tie-breaker. `toPage` passes the same frozen policy to count/select, clamps page bounds, propagates cancellation, and
rejects over-materialization. `executeVersionedMutation` requires an expected version and turns zero affected rows
into Conflict while rejecting fan-out. Exceptional raw SQL uses `defineRawSql` with explicit ownership and rationale.
A PostgreSQL 17 Testcontainers proof exercises tenant filtering, count/selection agreement, bounds, and ordering.

## Public doctor IDs

| IDs | Enforcement |
|---|---|
| `SKYN0001–0007` | Slice spine/thin map, sibling test, module context/citations, no repository/UoW, 500 effective lines. |
| `SKYN0008`, `0010`, `0020`, `0033` | Real co-located write journeys, correct operation coverage, response and unchanged-state assertions. |
| `SKYN0011–0012` | Tests under source and stable workspace-unique operation IDs. |
| `SKYN0015–0017` | Typed module map, explicit import/call registration, thin `src/app.ts` composition. |
| `SKYN0018–0019` | Registry-only codes plus cross-file uniqueness, use, and orphan checks. |
| `SKYN0022–0023` | Literal auth/kind, real authorization middleware, and visible current-user use. |
| `SKYN0030–0032` | Criterion/proof bijection and no skipped/todo evidence. |

ESLint owns single-file syntax and never performs synchronous workspace I/O. The asynchronous workspace doctor owns
cross-file joins. Strict discriminated-union narrowing is stronger than `.NET SKY0025`, so there is no redundant
Result guard rule. Drizzle-specific bounds/order/concurrency/raw-SQL obligations are enforced by explicit adapter
APIs and live PostgreSQL tests rather than unsafe generic name matching.

## Closed gates and local foundations

`skies.node.json` is the closed criterion/lane/proof/source-scope graph. `skies-node-foundation` validates it, rejects
unknown or missing facts, scans enforcement suppressions, computes explainable dependency closure, and runs
`--affected [--base <revision>]`, `--staged`, or `--full` with an optional `--fast` bound without a shell. Staged
checks are always bounded; `--fast` defers exhaustive fallbacks to authoritative CI and conflicts with `--full`.
Full writes `VERIFICATION.json` and `VERIFICATION.md`; skipped, not-run, timed-out, unknown-impact, and missing
proofs cannot become green.

Repository-owned NWC/NYA/RTW/WTW assets are pinned under the shared `csm.toml` storage root (`.skies/csm` default;
a legacy `csm.json` is read for migration but never written). `context` reads the bounded
WTW → RTW → NYA → NWC view; `check` always runs gate → WTW → RTW → NYA → NWC. Help/context/check perform no network
or ambient installation mutation.

Use `skies-node new <app>` for a transactional starter with CI, Git hooks, proof manifest, CSM assets, health
contract/proof, and all-platform Node 24 gate. All generators preflight the complete file plan, reject collisions and
unsafe symlink ancestry, preserve LF, support dry-run, and roll back partial failures.

Socket.IO is strictly opt-in: neither the starter nor `@skiesjs/framework` installs it. `skies-node g hub` adds
`@skiesjs/socketio` and `socket.io` in the same transactional plan as the explicit event contract, registration,
test, and proof binding. PostgreSQL/Drizzle and testing helpers likewise remain focused satellite packages.
