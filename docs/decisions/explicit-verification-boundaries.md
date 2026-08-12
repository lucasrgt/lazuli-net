# Decision: explicit local verification boundaries

**Status:** accepted and implemented.
**Date:** 2026-08-12.
**Supersedes:** the prior `explicit-local-verification-boundaries` decision, the
`primary-agent-foundation-orchestration` decision, and the prior authority-specific invariants named below.

## Decision

Local Skies checks require an explicit scope. Before commit, the primary agent stages the exact intended paths and
runs `skies check --task "<task>" --staged`; staged mode is always bounded.

Each repository chooses one checked authority boundary:

- CI authority uses a base-relative fast pre-push check and runs authoritative affected verification without
  `--fast` in pull-request CI.
- Local authority runs authoritative affected verification without `--fast` in the checked pre-push hook and does
  not require a pull-request workflow.

Both modes expose `skies check --task "<release>" --full` through an explicit release command. CI may invoke that
command, but a repository whose delivery is local may keep the full boundary local as well. `skies doctor` validates
the selected wiring. Bare `skies check --task ...` remains invalid and exits before any gate starts.

## Rationale

An unscoped local check derived every staged, unstaged, and untracked path and could widen one feature into the
repository's complete backend and browser inventory. On a strong development machine that made an ordinary feature
boundary take more than ten minutes. Explicit bounded feedback keeps the iteration loop fast, while checked
commands—not agent memory—guarantee that affected and exhaustive depth still run at their proper boundaries.

CI is valuable when a remote merge boundary needs an independent verdict, but it is not intrinsically more
authoritative than a checked local hook. Requiring it for a repository delivered and verified on one development
machine adds queueing, dependency installation, and duplicated execution without adding a distinct trust boundary.

## Rejected alternatives

We rejected making every local check exhaustive because its cost scales with the whole repository rather than the
change and makes frequent verification impractical.

We rejected merely recommending `--staged --fast` in agent instructions because an agent can omit a recommended
command and never run affected or full verification.

We rejected making fast mode silently drop directly mapped proofs because bounded feedback must still execute every
proof that the impact graph can map exactly.

We rejected requiring pull-request CI in every repository because local delivery has no remote merge boundary and
would pay the same verification cost twice.

## Invariants

Before commit, `skies check --staged` runs every directly mapped proof and defers only exhaustive fallbacks and
browser or device execution.
This supersedes `staged-check-preserves-mapped-proofs` with the same behavior under the explicit authority model.

Exactly one checked boundary owns authoritative affected verification without `--fast`: pull-request CI or the
local pre-push hook.
This supersedes `automation-owns-authoritative-depth`, which required CI authority in every repository.

When pull-request CI owns authority, the pre-push hook is base-relative and fast. When the local machine owns
authority, the pre-push hook is base-relative and authoritative, without `--fast`.
This supersedes `pre-push-check-is-base-relative-fast`, which described only CI authority.

Every repository exposes an explicit `--full` release command, whether that command is invoked locally or by
release automation.

An unscoped `skies check` exits before starting a gate.
This supersedes `unscoped-check-is-rejected` with the same behavior under the explicit authority model.
