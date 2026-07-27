---
id: 0002
title: Token contract — tokens.ts scaffold + sample instantiation
type: prd
stage: 2 of 7
status: ready
created: 2026-06-09
---

# PRD — Token contract

## Problem
The taxonomy (0001) is prose until a `tokens.ts` exists. The sample app has zero tokens (inline
styles in `ui.tsx`); a new app gets nothing from `lazuli g`. Without the single-source token file,
the kit (0003) has nothing to import and the band (0004) has nothing to point violators at.

## Why now (or why ever)
0003 imports these values; 0007 aliases hostpoint's tokens onto these names. Skipping this stage
means every app hand-rolls the taxonomy from prose — the exact non-determinism this wave kills.

## Outcome — done means
- `frontend-sdk/tools/design-scaffold.mjs` emits a doctor-conformant `tokens.ts` (refusing overwrite,
  same UX as `scaffold-feature.mjs`).
- `examples/sample-app/frontend/core/src/design/tokens.ts` exists — the canonical instance, with the
  default theme (light + dark values) and a completeness test.
- `npm --prefix frontend-sdk run check` green.

## Non-goals
- No CSS-vars file, no Tailwind/NativeWind config emission — the mechanism mapping is documented in
  DESIGN-CONVENTIONS.md, not shipped (mechanism is the app's).
- No theme switcher, no runtime.
- No consumption by `ui.tsx` yet (that is 0003).

## User stories
- As a coding agent in a fresh app, I run the design scaffold and get the taxonomy as compiling
  code with sane default values, so I never invent token names or values.

## Constraints
- `tokens.ts` is plain data — zero imports, zero functions beyond object literals. jsdom/RN-safe.
- Types must match 0001 §C1 character-exact.
- Hex literals are legal ONLY here (SKYFE012's exemption already covers `design/tokens.ts` via the
  `tokens` filename pattern — keep the filename).

## Open questions
None — default values are decided in the techspec.
