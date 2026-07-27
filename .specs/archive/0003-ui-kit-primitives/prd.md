---
id: 0003
title: UI kit — closed-API primitives in the sample app
type: prd
stage: 3 of 7
status: ready
created: 2026-06-09
---

# PRD — UI kit primitives

## Problem
The sample's `@/ui` seam is a leak: `ui.tsx` accepts free-form `className`, styles nothing, and
offers four loose components. An agent composing a screen still makes every visual decision — which
the kit must make for it. The strongest determinism layer (wrong = inexpressible) does not exist.

## Why now (or why ever)
The recipes (0005) and the ui-door rule (SKYFE024, enforced at error in 0005) are only honest if a
closed kit exists for views to consume. Without it, the band would just forbid things and offer no door.

## Outcome — done means
- `examples/sample-app/frontend/web/src/ui/` and `mobile/src/ui/` implement the 0001 §C2 API,
  styled exclusively from `core/src/design/tokens.ts` — no `className`/`style` props exposed.
- `Items.view.tsx` consumes the new API unchanged in spirit (same seam, richer primitives) and its
  tests stay green on both platform impls.
- The scaffolder emits the web kit (`design-scaffold.mjs --kit web`), so a fresh app gets it.
- A11y is built in: Field wires label/error to the control; Button exposes states accessibly;
  focus-visible ring on every interactive primitive.

## Non-goals
- No Dialog, Select, Tabs, Toast, DataTable (killed for v1 — apps extend their own `ui/`).
- No pilot-facing RN kit: the mobile impl exists to keep the agnostic-View seam honest in the
  sample, nothing more. Hostpoint keeps NativeWind.
- No styling library, no CSS files — inline style computed from tokens (zero deps, jsdom-testable).
- No theme switching.

## User stories
- As a coding agent building a screen, every prop I can type is a token name, so off-scale spacing
  and raw colors are not expressible.
- As a user tabbing through any Lazuli screen, I always see the focus ring; as a screen-reader user,
  every field announces its label and error.

## Constraints
- Public API = 0001 §C2 character-exact; deviations are a 0001 ADR supersession, not a local fix.
- Web impl must render in jsdom (the existing test harness); mobile impl must not import web APIs.
- Kit files live under `ui/` (the SKYFE024/025 exemption boundary — keep the path).

## Open questions
None.
