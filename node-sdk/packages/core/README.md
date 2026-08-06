# @skiesjs/core

HTTP-agnostic primitives shared by Skies Node.js slices and adapters. The package is plain TypeScript and has no
Express dependency.

## Results and errors

`Result<T>` is a discriminated union. Expected failures carry the closed `ErrorKind` catalog and stable client-facing
codes:

```ts
import { Errors, Result, type Result as Outcome } from "@skiesjs/core";

function findWallet(id: string): Outcome<{ id: string }> {
  return id === "known"
    ? Result.ok({ id })
    : Result.fail(Errors.notFound("wallets.not_found", "wallet not found"));
}
```

## Accumulated validation

`Validation` records all field failures before a slice returns. `collect` preserves nested field paths and codes from
another failed `Result`; `require` accepts a syntactically valid non-nil UUID; `inRange` includes both bounds.

```ts
const validation = new Validation()
  .require(input.walletId, "walletId", "walletId.required")
  .notBlank(input.name, "name", "name.required")
  .inRange(input.amount, 1, 10_000, "amount", "amount.out_of_range")
  .collect("money", Money.from(input.amount));

if (validation.failed) return Result.fail(validation.toError());
```

## Pages

`Page<T>` is the structural four-member wire shape. `mapPage` projects items while copying `totalCount`, `pageNumber`,
and `pageSize` unchanged, including for empty pages past the end.

```ts
const views = mapPage(walletPage, (wallet) => ({ id: wallet.id, name: wallet.name }));
```

## Ordered lifecycles

Declare state order explicitly. A future step is not reached, and `advance` changes the cursor only when the step being
completed is exactly the current one, so revisiting an earlier step cannot regress it.

```ts
const onboarding = orderedLifecycle(["profile", "identity", "review", "done"] as const);
if (!onboarding.reached(current, "identity")) return Result.fail(notReached);
current = onboarding.advance(current, "identity", "review");
```

## Scalar codecs

A `ScalarCodec<TValue, TPrimitive>` keeps a value object's smart constructor authoritative on inbound data while
encoding the object as the primitive it replaced. Runtime primitive metadata lets contract adapters keep the same wire
schema. Use `trustedScalarCodec` only for values already trusted by the caller.

```ts
const centsCodec = scalarCodec<Cents, number>({
  primitive: { type: "integer", format: "int64" },
  encode: (cents) => cents.value,
  decode: Cents.from,
});
```
