# @skiesjs/doctor

Deterministic, asynchronous workspace checks for plain TypeScript Skies applications. The doctor parses each file as an
independent TypeScript syntax tree and joins normalized workspace facts. It never creates a TypeScript `Program` or
language service and performs no synchronous filesystem reads.

```sh
skies-node-doctor [workspace]
skies-node-doctor [workspace] --json
```

The command exits `0` when the workspace passes, `1` when convention findings remain, and `2` when inspection is
incomplete. Human and JSON findings use the same deterministic path/line/column/code/message ordering.

## Public diagnostics

| ID | Checked convention |
|---|---|
| `SKYN0003` | Every `*.slice.ts` has its exact co-located `*.slice.test.ts`. |
| `SKYN0004` | Every module has an exact `*.ctx.md` with nonempty `## Boundaries` and `## Design notes`. |
| `SKYN0005` | Backtick symbol citations in module context resolve inside that module. |
| `SKYN0008` | A `post`, `put`, `patch`, or `delete` contract has one happy and one sad journey. |
| `SKYN0010` | A journey covers its exact co-located write operation, never a read or another slice. |
| `SKYN0012` | A slice exports one direct `const contract = defineContract({...})` with a stable, workspace-unique operation ID. |
| `SKYN0015` | A module exports a synchronous, explicitly typed `map(...): void`. |
| `SKYN0016` | `src/modules.ts` maps every module and each module maps every owned slice through namespace imports. |
| `SKYN0017` | Inline/local HTTP behavior does not leak into the narrowly scoped `src/app.ts` composition index. |
| `SKYN0019` | Error registry values are unique/live and factory/contract member uses resolve to their owning registry. |
| `SKYN0020` | Journeys contain response assertions; sad journeys also prove that the write did not occur. |
| `SKYN0023` | A required-auth slice visibly reads `currentUser` in `handle` or its composed `mapSlice` handler. |
| `SKYN0030` | Every declared criterion has exactly one co-located, statically attached proof citation. |
| `SKYN0031` | Every slice declares at least one stable criterion ID, without duplicates. |
| `SKYN0032` | Tests/proofs/journeys do not use `.skip`, `.todo`, `skipIf(true)`, or `todoIf(true)`. |
| `SKYN0033` | Journey evidence has the isolated, static, executable shape described below. |

`SKYN0018` remains the local-syntax responsibility of `eslint-plugin-skies-node`: it rejects inline error-code
literals and malformed `defineErrorCodes` declarations. `SKYN0019` deliberately supplies the cross-file reverse
join rather than duplicating that rule.

## Static journey convention

A write is derived from the direct string-literal `method` in its `defineContract` call. Its evidence lives only in
the exact co-located `<name>.slice.journey.ts`; a promising filename alone is never evidence. The file imports
`journey` and `JourneyPath` from `@skiesjs/testing` and makes direct module-level calls:

```ts
import { expect } from "vitest";
import { journey, JourneyPath } from "@skiesjs/testing";

journey(
  { covers: "Billing.CreateInvoice", path: JourneyPath.Happy, criterion: "billing.invoice-created" },
  "creates an invoice",
  async () => {
    const createdResponse = await postInvoice();
    expect(createdResponse.status).toBe(201);
  },
);

journey(
  { covers: "Billing.CreateInvoice", path: JourneyPath.Sad },
  "rejects a duplicate without changing state",
  async () => {
    const beforeState = await loadInvoices();
    const rejectedResponse = await postDuplicateInvoice();
    const afterState = await loadInvoices();
    expect(rejectedResponse.status).toBe(409);
    expect(afterState).toEqual(beforeState);
  },
);
```

Metadata, test name, and handler must be direct AST-readable values. The `covers` literal equals the co-located
contract's operation ID. A response assertion is a Vitest `expect` over a response binding (a name ending in
`Response`) or its `status`, `statusCode`, `body`, or `headers`. The sad-path unchanged-state floor recognizes a
`before`/`after` (or `pre`/`post`) comparison, a non-response null/undefined assertion, or an empty collection
assertion. Runtime execution remains the test runner/gate's responsibility, so Vitest must include
`*.slice.journey.ts` in its checked-in test configuration.

## Contract, auth, error, and composition joins

A canonical slice contract is an exported local symbol:

```ts
export const contract = defineContract({
  operationId: "Billing.CreateInvoice",
  method: "post",
  auth: "required",
  // ...
});
```

Operation IDs begin with a letter and contain letters/digits plus stable `.`, `_`, or `-` separators. For
`auth: "required"`, merely supplying authorize middleware is not proof of scoped authorization: `handle` or the
direct `mapSlice` `handle` callback must read a `currentUser` parameter/property or call the `currentUser` helper
imported from `@skiesjs/auth-express`.

`SKYN0017` intentionally inspects only `src/app.ts` and only rejects inline function handlers or handler functions
implemented in that file when passed to `app.use`/HTTP verbs. Imported adapters, `express.json()`, `mapModules`, and
other explicit composition calls are left alone.

`SKYN0019` inventories direct `defineErrorCodes({...})` registries. A literal may be declared once workspace-wide;
each member must be consumed by a recognized `Errors.*` factory or referenced from a direct slice contract. Named
relative imports resolve the member to its declaration, and a module cannot borrow another module's registry.

## Criterion/proof structural seam

The currently type-compatible declaration is one checked-in line per slice criterion:

```ts
// @skies-criterion billing.invoice-created
```

The doctor also understands a future direct `criteria: ["billing.invoice-created"]` contract property. A write
journey's direct `criterion` metadata is its citation. Other proof layers cite a criterion in the exact sibling
`*.slice.test.ts` with a line immediately attached to a direct `unit`, `integration`, `e2e`, or `journey` call
imported from `@skiesjs/testing`:

```ts
// @skies-proof billing.invoice-readable
e2e("returns the invoice", async () => { /* assertions */ });
```

This package owns only the structural slice × criterion × citation bijection. A future foundation manifest may
materialize the deterministic comment/contract declarations, while `@skiesjs/foundation` owns catalog validity,
runner verdict inventory, and proof execution. A citation is not represented as a runtime verdict.

## Deliberately unclaimed persistence rules

The generic doctor does **not** emit `SKYN0009`, `SKYN0024`, `SKYN0026`, `SKYN0027`, or `SKYN0028`. Ownership
crossing, raw SQL, optimistic concurrency predicate/rowcount, bounded materialization, and unique ordering require a
separately scoped Drizzle/PostgreSQL query-helper contract. Generic method or identifier matching would create unsafe
false parity claims; those IDs remain for an adapter-specific doctor.
