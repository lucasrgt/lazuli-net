# Decision: the frontend harness — MVVM convention + wrapped orval, never a bespoke generator

**Status:** accepted — proposed v0, no code yet.
**Date:** 2026-06-04.
**Supersedes/extends:** the `CONVENTIONS.md` non-goal "No frontend/UI generation" — clarified
below to mean *no source-gen of behavior and no bespoke generator*, not *no frontend harness*.
**Full convention:** [FRONTEND-CONVENTIONS.md](../FRONTEND-CONVENTIONS.md).

---

## Context

Skies's doctor enforces the backend slice convention so an LLM cannot drift past it. The
frontend has no such harness, and the failure it invites is documented in our own history:
hostpoint shipped screens rendering **storybook fixtures inlined as data** (`WAR-*`
workarounds) because the SDK query did not exist yet — the AI reported "done" while the screen
was mocked. We want the frontend equivalent of the backend's guarantee: **wired is the only
legal shape; mock is structurally visible and fails the build.**

Two cautionary tales bound the design. **The predecessor language** died owning a bespoke
compiler — including a frontend codegen apparatus (audience-scoped SDK projection, smart stubs)
that shipped to nobody. **aerocoding** died generating artifacts for features that did not exist.
Any frontend harness must avoid both: it is enforcement + convention, never a generator that
owns behavior.

Stack is decided: **React + TanStack** (Query + Router). Blazor and MAUI were considered and
rejected as too immature for the target; the cost accepted is a second, TS-world toolchain for
the harness.

## Decision

1. **One feature = an MVVM triple** — `<Name>.view.tsx` (pure render) + `<Name>.viewModel.ts`
   (the only data door) + `<Name>.test.tsx`. The ViewModel is a **plain custom hook**
   (`useModel(params) → { state, ...commands }`), render-agnostic and unit-testable without JSX —
   the frontend mirror of the HTTP-agnostic `Handle`. The View owns no data access, so it is
   **mock-free by construction**. TanStack Query is the Model; the ViewModel composes it and
   never wraps it (no frontend `IRepository`). One ViewModel per screen, never per query.

2. **The "wired" guarantee is the type system.** The slice's `Input`/`Output` → OpenAPI → a
   generated typed TanStack hook per slice. An invented endpoint is a `tsc` error (no silent
   404). The completeness gate is the compiler, not a lint rule.

3. **The generator is stock, wrapped — never bespoke.** The application's `npm run gen:client` runs **orval**
   (`react-query` target) under a shipped `orval.config.ts` + a Skies **mutator** (the typed
   client: `Result<T>` unwrap, auth, error→state). The opinion lives in config + convention, not
   in a fork — exactly as the back uses EF Core stock and puts the opinion in the slice + doctor.
   The generated layer is boring on purpose; all density lives in the hand-written ViewModel.

4. **The bright line: generate the contract, scaffold the behavior.** Types and the typed
   slice-hook are *generated* (plumbing, re-emitted, never edited). The ViewModel body is
   written once and then owned — a visible skeleton, never re-emitted. Source-gen of ViewModel behavior (and
   predecessor-style "smart stubs" that
   pre-fill logic) is **out** — it is the source-gen vector.

5. **The harness is a separate, optional, doctor-removable package** — an `@skiesjs/eslint-plugin`
   for in-file rules plus a thin `ts-morph` pass for cross-file shape, invoked alongside `skies
   doctor`. It never enters `Skies.Framework.Abstractions` or `Skies.Framework.Doctor` — the `skies`/`skies-dev`
   split, applied again. Initial rule catalog: `SKYFE001`–`SKYFE007` (see the convention).

6. **One backend micro-convention** makes the slice→hook name 1:1: the `Map` names its endpoint
   (`.WithName("Deposit")`) so the `operationId` — and thus `useDeposit` — is the slice name.

## Consequences

- The policed surface collapses to the ViewModel; the View and completeness need no rules.
- The harness lives in a toolchain (TS/ESLint) outside .NET — accepted cost of the React choice.
- Plumbing-codegen is now *activated* (it was parked "not in v0" in `CONVENTIONS.md`), but only
  via stock tooling — no bespoke compiler, so the bespoke-compiler vector stays closed.
- `CONVENTIONS.md`'s "No frontend/UI generation" non-goal needs a one-line clarification that it
  forbids *behavior* generation and bespoke generators, not the enforcement harness.

## Alternatives rejected

- **A bespoke Skies OpenAPI→TS generator ("envenenada nativa").** Re-solves parsing/emission
  orval already owns; it is the literal bespoke-compiler gesture. Stock-wrapped wins. Bespoke is earned
  only by a concrete, proven limitation of orval — and even then as a thin post-processor, not a
  rewrite.
- **Blazor/MAUI frontend** (would keep the harness in Roslyn). Rejected: too immature for the
  target. Would have been more on-brand; the ecosystem maturity outweighed it.
- **Raw orval with no convention.** Generic hooks with no MVVM seam → the harness has no crisp
  anchor and the "no mock" rule turns heuristic and noisy. The convention is what makes the rules
  trivial.
- **MVVM as a framework** (classes, observables, two-way binding, MobX). Fails
  stranger-maintainable — Angular/WPF idiom inside React. Kept as a naming discipline over hooks.
