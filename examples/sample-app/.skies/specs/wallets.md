<!-- clockwork-spec -->
# Wallets — acceptance criteria (Clockwork spec)

> The per-feature criterion manifest for the Wallets slices (Deposit, Withdraw). Each id is the AVP
> catalog id declared in the module manifest and proven by `[AVP(typeof(Slice), "id")]` beside the slice; the
> frontend pair is `@verify`/`@avp`. The harness's Clockwork matrix reads this file to close the
> spec↔code bijection: a declared criterion with no obligation is a *gap*, an obligation no manifest
> declares is *creep*. Changes are deltas — add/modify/remove a criterion line keyed on its id.

## Criteria
- `idempotency-key-honored` — a money mutation carrying an Idempotency-Key is applied at most once; a retry replays the recorded outcome instead of moving the balance again. (Deposit, Withdraw · http)
- `no-phantom-success` — the deposit UI never reports success when the request failed: the entered amount persists and the command error is shown. (DepositView · dom)

## Dismissed
- split-invariant — no money is split across parties in these slices (single-wallet inflow/outflow); the amount is exact by construction (`Money`), nothing to apportion.
- own-resource-only / server-is-authoritative — the sample has no caller identity yet, and the balance is already recomputed server-side; revisit when wallets gain ownership.
- pages-cover-the-set — Deposit/Withdraw are single-entity mutations, not lists.
