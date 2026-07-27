---
id: 0003
title: UI kit — closed-API primitives in the sample app
type: techspec
status: done
created: 2026-06-09
completed: 2026-06-09
depends_on: [0001, 0002]
parallel_safe: true
test_gate: npm --prefix frontend-sdk run check
agent: claude-fable-5
---

# TechSpec — UI kit primitives

## Approach
Replace the two `ui.tsx` leaks with `ui/` folders implementing 0001 §C2: one file per primitive,
styled by direct lookup into `core/src/design/tokens.ts`, no other imports beyond react /
react-native. Web is the reference implementation (full state handling, full a11y wiring); mobile is
the honest mirror (same names/props, RN primitives). Then template the web kit into the scaffolder so
`design-scaffold.mjs --kit web` emits it for fresh apps.

## Surface
**Create:**
- `examples/sample-app/frontend/web/src/ui/` — `tokens-bridge.ts` (re-export from `@/design/tokens` —
  one import seam), `Screen.tsx`, `Stack.tsx`, `Text.tsx`, `Button.tsx`, `Field.tsx`, `Input.tsx`,
  `Card.tsx`, `states.tsx` (EmptyState + ErrorState), `index.ts` (barrel = the `@/ui` resolution).
- `examples/sample-app/frontend/mobile/src/ui/` — same module names, RN impls, `index.ts`.
- `examples/sample-app/frontend/web/src/ui/ui.test.tsx` — kit behavior tests (below).

**Modify:**
- `examples/sample-app/frontend/web/src/ui.tsx`, `mobile/src/ui.tsx` — delete (replaced by `ui/`);
  update the tsconfig path alias for `@/ui` if it pointed at the files rather than the dirs.
- `examples/sample-app/frontend/core/src/items/Items.view.tsx` — adopt the closed props
  (`<Stack gap="md">`, `<Text role="title">`); remove any `className`/`variant` stragglers.
- `frontend-sdk/tools/generate.mjs` — `renderUiKitWeb()` returning the web `ui/` file map.
- `frontend-sdk/tools/design-scaffold.mjs` — `--kit web` flag emits the kit beside the tokens.

## Contracts
- Public API: 0001 §C2 character-exact. `@/ui` exports exactly: `Screen, Stack, Text, Button, Field,
  Input, Card, EmptyState, ErrorState` (plus types of their prop objects).
- Behavior contracts the tests pin:
  - `Button`: web renders `<button type="button">`; `disabled` sets the attr + `color.textMuted`;
    `loading` disables and announces via `aria-busy`; focus-visible = 2px ring `color.focusRing`
    (`:focus-visible` via onFocus/onBlur + `matches(":focus-visible")` check, or the simpler
    always-ring-on-keyboard-focus approach — agent's pick, ring presence is the contract).
  - `Field`: renders `<label htmlFor={fieldId}>`; `hint` renders with id `${fieldId}-hint`, `error`
    replaces it with id `${fieldId}-error` + `role="alert"`; child control receives
    `aria-describedby` pointing at whichever is present (Field renders the describedby wiring via
    context consumed by `Input` — both are kit-internal, so the seam stays closed).
  - `Input`: `invalid` sets `aria-invalid` + `color.danger` border; `kind` maps to
    type/inputMode (web) and keyboardType/secureTextEntry (RN).
  - `Text`: `role` maps 1:1 to `text[role]`; `tone` maps to `color.text/textMuted/danger/textInverse`.
  - `Stack`: flex; `gap: space[gap]`; never margins.
  - All touch targets: `minHeight: 44` on Button/Input.
- Kit files under `ui/` — the SKYFE024/025/026 exemption path (locked in 0001 §C3).

## Plan — for the executing agent
1. Read `web/src/ui.tsx`, `mobile/src/ui.tsx`, `Items.view.tsx`, `Items.test.tsx`, the frontend
  `tsconfig.json` (alias resolution), and `core/src/design/tokens.ts` (0002 output).
2. Write `ui.test.tsx` first against the behavior contracts above (red).
3. Implement the web `ui/` primitives, one file each, inline token lookup only.
4. Implement the mobile mirror (props identical; jsdom tests don't cover it — typecheck does).
5. Update `Items.view.tsx` to the closed props; delete the old `ui.tsx` files; fix `@/ui` alias.
6. Extract the web kit into `renderUiKitWeb()` in `generate.mjs`; wire `--kit web` in
   `design-scaffold.mjs`; add a drift test: rendered map === committed `web/src/ui/` files.
7. `npm --prefix frontend-sdk run check` until green.

## Tests first (TDD)
- [ ] `Button renders label, fires onPress, blocks when disabled/loading, sets aria-busy` —
- [ ] `Button shows the focusRing treatment on keyboard focus` — the never-removed ring.
- [ ] `Field associates label via htmlFor and describedby points at hint, then error when present` —
- [ ] `Field error has role=alert and replaces the hint` —
- [ ] `Input invalid sets aria-invalid and the danger border color` —
- [ ] `Text role=title renders text.title fontSize/lineHeight/weight; tone=muted uses color.textMuted` —
- [ ] `Stack lays out with space[gap], no margins on children` —
- [ ] `kit exposes no className/style prop` — type-level: `// @ts-expect-error` compile assertions.
- [ ] `Items.view renders on the web kit unchanged` — existing Items tests stay green.
- [ ] `scaffolded kit matches the committed kit` — renderUiKitWeb() output diff === ∅.

## Gate
`npm --prefix frontend-sdk run check` is green (typecheck across web+mobile impls, lint, all tests
including the Items suite).

## Risks & rollback
- `@/ui` alias breakage across core/web/mobile tsconfigs → step 1 reads the alias before touching it;
  the Items suite is the canary.
- Mobile impl rots (no jsdom coverage) → typecheck covers props/parity; the drift is acceptable for a
  seam-honesty mirror (recorded as debt, revisited only if a real RN consumer appears).
- Focus-visible behavior differs across browsers/jsdom → contract is "ring present on keyboard
  focus", not the detection mechanism; test via fireEvent keyboard focus.

**Rollback:** revert; restore the two `ui.tsx` files (git), Items.view props revert with them.

## As-Built
Shipped 2026-06-09, commit `76436a1`. Deltas: `renderUiKitWeb()` lives in `tools/ui-kit-web.mjs`,
not generate.mjs (separate concerns; the embed is GENERATED from the committed kit files, so
template ≡ exemplar by construction and the drift test pins it both ways). vitest gained the
`web/**` test glob (ui.test.tsx was invisible without it) and explicit RTL cleanup (no vitest
globals → no auto-cleanup). The mobile mirror stays outside the gate (no react-native in the
workspace — the same posture as the ui.tsx it replaced). renderFeature's view template moved to the
closed props. Later (0005): `Text` gained `alert` and the kit embed was rebuilt.
