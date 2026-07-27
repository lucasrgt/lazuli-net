# Decision: verification is complete, shape-derived, and fail-closed

**Status:** accepted and implemented.
**Date:** 2026-07-22.

## Context

Pilot inventories exposed a structural failure: the same implementing agent could decide whether its feature owed
deep proof. The cheapest path was therefore also a valid-looking path. Pauta accumulated 344 slices while only a
small manually selected subset owed journeys; Hostpoint had the same omission in a different policy mode. AVP and
Assay existed, but optional classification and curated-only E2E let production behavior remain outside the gate.

The failure is architectural, not prompt wording. Asking an LLM to remember a marker still makes memory and
self-assessment part of the trusted computing base.

## Decision

Verification has no application-controlled mode.

1. Every backend slice declares at least one acceptance criterion in `<Module>.spec.toml` and carries an exact
   `[AVP(typeof(Slice), "criterion")]` proof. The gate joins subject × criterion × executed test verdict.
2. Every write slice carries happy and sad backend journeys. Write depth comes from ordinary source signals:
   persistence calls and write endpoint verbs mean write; a visible GET with no write signal means read; ambiguity
   means write. Application code supplies no risk label.
3. A sad backend journey proves both rejection and unchanged post-state. A happy journey proves an observable
   effect. Disabled or not-executed tests are failures.
4. Every ViewModel carries a co-located executable Assay proof and at least two distinct `@e2e` obligations. Surface
   flow entries name their exact feature in `features`, cite the `{ id, evidence }` criteria they prove, visibly
   assert distinct evidence for each, cover the feature's complete `@verify`/Assay set, and collectively prove
   happy and sad behavior as a minimum path floor. A criterion belongs to one executable case, so paths cannot
   borrow each other's proof. Every consumed backend hook is named by a linked flow.
5. Every declared flow is executable and remains in the universal inventory. Ordinary commit/push/PR gates execute
   the Git-derived transitive impact closure; `skies gate --full` executes the exhaustive inventory before a release.
   An unaffected proof is reported as such, never relabeled as a pass.
6. `Skies.toml` declares topology only. The schema is closed; frontend packages containing ViewModels or a
   flow registry are inventoried from disk and must be declared as products. There is no fallback discovery path.
7. A checked GitHub workflow directly runs `skies gate`. Repository branch rules must require its stable status and
   disallow bypasses, placing final authority outside the code change an implementing agent controls.

The old classification attributes, inline criterion attribute, manifest proof modes, and topology fallbacks are
removed from their packages rather than retained as compatibility surfaces.

## Why reads and writes differ on the backend

“Complete” does not mean manufacturing two meaningless HTTP tests for a pure query. Every read still owes its named
AVP property, ordinary co-located tests, and — once visible — browser happy and sad behavior. Backend happy/sad
journeys exist where unchanged state is a meaningful invariant: writes. Unrecognized shapes receive that stronger
bar, so uncertainty never lowers proof.

## How this resists the LLM's shortest path

- There is no risk decision to make and no downgrade token to stamp.
- Generators emit the obligation and red proof skeleton in the same change.
- Subject binding prevents one generic proof from paying several features' debt.
- Independent filesystem inventory prevents deleting a manifest line from hiding a frontend.
- Skip/focus syntax, missing runners, placeholder scripts, missing terminals, and `NotExecuted` verdicts are red.
- Package scripts cannot hide a narrowed runner: the release command must be unfiltered and Playwright collection
  must contain every declared web `spec/case` before the stack is started.
- Runner selection is derived rather than configured: `target:web` means Playwright and `target:native` means
  Maestro. Cypress/Detox configuration and a target/engine mismatch are blocking gaps.
- CI wiring is validated locally; required branch status is the external enforcement boundary.
- Runtime selection comes from the Git index/revision delta and the subject bindings already required by the
  framework. A reverse C# syntax graph follows shared types and extension methods to their transitive slice and
  test consumers. The application cannot author a risk label or test filter. Unknown/shared runtime changes with
  no reachable proof widen to a full surface, and unavailable Git ancestry widens to full. Changes limited to the
  CLI pin, Git hooks, or checked workflows remain doctor-validated control-plane changes; they do not alter
  application behavior and therefore do not widen runtime proofs.

Prompt instructions remain useful guidance, but none is relied upon for the verdict.

## Consequences and limits

The proof inventory grows monotonically; ordinary execution does not. Pre-commit uses `--staged --fast`, local
pre-push uses `--affected --base <revision> --fast`, pull requests use authoritative `--affected`, and releases
use `--full`. Fast local feedback still executes every mapped backend filter, unit test, and Assay, but explicitly
defers an exhaustive fallback and browser/device execution to CI. Shared runtime infrastructure and ambiguous
dependencies widen rather than guess in authoritative gates; control-plane edits are validated without
impersonating runtime impact. Sharding remains available for the exhaustive audit, but is not required to pay the
cost of unrelated tests on every small change.

Static rules can enforce proof identity, shape, execution, and a structural assertion floor. They cannot prove that
an assertion is semantically strong. Review and occasional mutation testing remain depth audits, but neither can
replace the deterministic release gate.
