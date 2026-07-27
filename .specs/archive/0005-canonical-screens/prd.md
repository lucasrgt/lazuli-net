---
id: 0005
title: Canonical screens — the recipe catalog in the sample app
type: prd
stage: 5 of 7
status: ready
created: 2026-06-09
---

# PRD — Canonical screens (recipes)

## Problem
Tokens + kit + band constrain the vocabulary, but composition stays free: an agent still decides how
a form screen is laid out, where errors surface, what a list's empty state says. Agents are excellent
at instantiating exemplars and mediocre at inventing layout — and today the repo offers exactly one
thin exemplar (Items list). Composition is the remaining non-determinism.

## Why now (or why ever)
Recipes are the third determinism layer (right = copyable) and the precondition for promoting the
design band + web a11y to error: rules promote when the canonical code is clean, never before. The
pauta relift (0007) instantiates these recipes; without them it re-invents — the failure being fixed.

## Outcome — done means
- The sample app holds two canonical screens, kit-composed, band-clean, a11y-clean, tested:
  - **list** — `items/` relifted onto the kit (loading/empty/error/ready via `<Resource>`).
  - **form** — `itemForm/` created: Field anatomy, zod + react-hook-form per the blessed shape,
    visual validation, mutation error surfaced (SKYFE013 discipline), submit states.
- SKYFE024–026 promoted `warn → error`; web jsx-a11y promoted to error for the sample tree.
- DESIGN-CONVENTIONS.md recipe index points at the real paths, marked "instantiate, do not invent".

## Non-goals
- No detail-screen recipe unless the generated client already exposes get-by-id (then it's in scope;
  if absent, it is deferred — never add backend endpoints in this stage).
- No dashboard/settings/wizard recipes — they arrive when a pilot proves the archetype (harvest).
- No new kit primitives; if a recipe needs one, that is a 0003 gap → stop and report, don't improvise.
- No rn-a11y promotion (mobile mirror stays warn — no real RN consumer yet).

## User stories
- As a coding agent told "build a create-X screen", I copy `itemForm/`, rename, bind my slice, and
  the result is consistent with every other form in the ecosystem without me deciding anything visual.

## Constraints
- Each recipe is a complete blessed feature unit: `.viewModel.ts` + `.view.tsx` + `.test.tsx` +
  `.i18n.ts` (3 locales) — every existing SKYFE rule green at error.
- Form recipe binds only to endpoints already in `client.gen/sample.ts`.

## Open questions
None.
