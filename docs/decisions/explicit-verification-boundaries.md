# Decision: explicit local verification boundaries

**Status:** accepted and implemented.
**Date:** 2026-07-30.
**Supersedes:** `primary-agent-foundation-orchestration` and its
`fail-closed-skies-check-before-completion` invariant.

## Decision

Local Skies checks require an explicit scope. Before commit, the primary agent stages the exact intended paths and
runs `skies check --task "<task>" --staged`; staged mode is always bounded. Before push, the agent and hook run
`skies check --task "<review>" --base <target-revision> --fast`.

Pull-request CI owns authoritative affected verification and runs without `--fast`. Release automation owns
`skies check --task "<release>" --full`. Bare `skies check --task ...` is invalid and exits before any gate starts.
These automation-owned depth gates are validated by `skies doctor`, so an agent cannot silently replace them with
the faster local modes.

## Rationale

An unscoped local check derived every staged, unstaged, and untracked path and could widen one feature into the
repository's complete backend and browser inventory. On a strong development machine that made an ordinary feature
boundary take more than ten minutes. Explicit bounded local feedback keeps the iteration loop fast, while checked
hooks and CI—not agent memory—guarantee that affected and exhaustive depth still run at their proper boundaries.

## Rejected alternatives

We rejected making every local check exhaustive because its cost scales with the whole repository rather than the
change and makes frequent verification impractical.

We rejected merely recommending `--staged --fast` in agent instructions because an agent can omit a recommended
command and never run affected or full verification.

We rejected making fast mode silently drop directly mapped proofs because bounded feedback must still execute every
proof that the impact graph can map exactly.

## Invariants

Before commit, `skies check --staged` runs every directly mapped proof and defers only exhaustive fallbacks and
browser or device execution.

Before push, the checked hook runs a base-relative fast review of the committed diff.

Pull-request CI runs authoritative affected verification without `--fast`, and release automation runs `--full`.

An unscoped `skies check` exits before starting a gate.
