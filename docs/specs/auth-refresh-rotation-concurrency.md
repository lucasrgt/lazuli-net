# Spec — refresh-rotation concurrency (RowVersion + theft grace window)

**Status:** IMPLEMENTED (finding #7 of the round-2 auth audit). The `auth` blueprint now ships all three
parts: `UserSession.RowVersion` (a `[Timestamp]` token), the 10-second theft grace window
(`SessionToken.RefreshReuseGrace` + `AccountErrorCodes.SessionRetry`), and the `DbUpdateConcurrencyException`
catch in `Refresh` mapped to the benign retry. Parts (1) and (2) are proven by the render+compile smoke
(`tools/auth-smoke.sh`, in-memory, deterministic via a controllable clock); part (3)'s exception path is
relational-only (the in-memory provider never raises it) and is documented below, not shipped as a test.
The sad write journey was reworked accordingly (see below).

## Problem

`Refresh` reads a `UserSession` slot, checks `UsedAt == null`, then writes (marks the slot used, adds a
new slot). That read-then-write has no concurrency guard, so two refreshes of the **same** token that
race are last-write-wins:

- Trigger #1 — a single client double-firing (React StrictMode / double-bootstrap) — is already mitigated
  upstream by `@skiesjs/react` 0.5.0 single-flight rotation (the two calls collapse into one).
- The residual is a genuine **cross-tab** race: two tabs sharing the one httpOnly refresh cookie each
  present the same live token at the same instant. Today both can pass the `UsedAt == null` check and
  succeed, forking the family; the theft-detection (`UsedAt != null` ⇒ burn) is not atomic with the write.

The doctor already flags this: `SKY0026` (warn) fires on `Login`/`Register`/`Refresh` because
`UserSession`/`User` carry no concurrency token.

## Agreed design

1. **`[Timestamp] public byte[] RowVersion { get; set; }`** on `UserSession` (and the optimistic-
   concurrency check it enables). EF then makes the losing racer's `SaveChanges` throw
   `DbUpdateConcurrencyException` instead of silently winning.
2. **A 10-second theft grace window** keyed off `UsedAt`:
   - reuse of a rotated token **within 10s** of its `UsedAt` ⇒ **benign** — return a transient "retry"
     error, do **not** burn the family. The client re-reads the cookie the winner rotated and retries.
   - reuse **after** the window ⇒ **theft** — burn the whole family (today's behavior, preserved).
3. **Catch `DbUpdateConcurrencyException`** on the rotation `SaveChanges` and map it to the same benign
   "retry" error — the racer that lost the optimistic-concurrency check is a benign concurrent refresh,
   not a thief.

## How the write journey was reworked

`AuthJourney.Replayed_refresh_token_burns_the_whole_family` replayed the spent token **immediately** and
asserted the family was burned. Under the grace window an immediate replay is now *benign*, so that single
assertion no longer holds. The coverage was split, not weakened:

- The E2E sad journey (`A_replayed_refresh_token_is_rejected_without_killing_the_live_one`) now proves the
  wired property an HTTP test *can* prove without advancing the server clock: a replayed spent token is
  rejected (401) **and the legitimately-rotated token still refreshes** — i.e. the benign concurrent replay
  does not kill the family. This is exactly the new behaviour #7 introduces.
- The theft-burn (replay *after* the window) and the within-window benign retry are proven deterministically
  in `RefreshTests` with a controllable `TimeProvider` (`MutableClock`), which an E2E journey cannot advance.

The concurrency-exception path (3) needs Postgres — the EF InMemory provider does not enforce optimistic
concurrency, so it never raises `DbUpdateConcurrencyException`. The catch is shipped in `Refresh`, but it
is not covered by the in-memory smoke; it would be exercised by a `Skies.Framework.Testing.Postgres` (Testcontainers
→ Docker) `[Integration]` test, documented below. Such a test is *not* generated into the scaffold, because
a consuming app may not reference `Skies.Framework.Testing.Postgres` — shipping it would break compilation there.

## Tests

The (2) grace-window tests below shipped in `RefreshTests` (in-memory, `MutableClock`). The (3) optimistic-
concurrency test is the Postgres-only reference — documented here, not generated (see above).

```csharp
// (2) Grace window — deterministic, in-memory, via a controllable clock.
[Unit, Fact]
public async Task Reuse_within_the_grace_window_is_a_benign_retry_not_theft()
{
    // login → rotate (first→second) at T. Replay `first` at T+5s.
    // Expect: a transient/retry failure, the family is NOT burned, `second` still refreshes.
}

[Unit, Fact]
public async Task Reuse_after_the_grace_window_burns_the_family()
{
    // login → rotate at T. Replay `first` at T+11s.
    // Expect: Unauthorized AND the whole family dead (today's theft behavior). Replaces the immediate
    // replay in AuthJourney.Replayed_refresh_token_burns_the_whole_family.
}

// (3) Optimistic concurrency — Postgres only (Docker / Testcontainers).
[Integration, Fact]
public async Task Two_concurrent_refreshes_of_the_same_token_yield_one_winner_and_one_benign_retry()
{
    // Two parallel Refresh.Handle calls on the same live token against a real Postgres store.
    // Expect: exactly one rotates; the loser surfaces the benign retry (DbUpdateConcurrencyException
    // caught), never a false theft-burn, never a forked family.
}
```

## Migration note

Adding `RowVersion` is a schema change: consuming apps need an EF migration (`AddColumn RowVersion`,
`rowversion`/`bytea` + concurrency token). Call it out in the package release notes — it is the "alto
raio" the owner flagged.
