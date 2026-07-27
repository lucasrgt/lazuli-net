---
id: 0002
title: Token contract — tokens.ts scaffold + sample instantiation
type: techspec
status: done
created: 2026-06-09
completed: 2026-06-09
depends_on: [0001]
parallel_safe: true
test_gate: npm --prefix frontend-sdk run check
agent: claude-fable-5
---

# TechSpec — Token contract

## Approach
Mirror the existing scaffold pattern exactly: a `render*()` template function (like `renderFeature`
in `tools/generate.mjs`) + a thin CLI wrapper that writes files and refuses overwrite (like
`tools/scaffold-feature.mjs`). The template IS the canonical content; the sample instance is the
template's own output, so scaffold and exemplar cannot drift.

## Surface
**Create:**
- `frontend-sdk/tools/design-scaffold.mjs` — CLI: `node tools/design-scaffold.mjs [targetDir]`,
  default target `core/src/design/`; writes `tokens.ts`; refuses overwrite; prints next steps.
- `examples/sample-app/frontend/core/src/design/tokens.ts` — the canonical instance (scaffold output, committed).
- `examples/sample-app/frontend/core/src/design/tokens.test.ts` — completeness tests (below).

**Modify:**
- `frontend-sdk/tools/generate.mjs` — add `renderDesign()` returning `{ "tokens.ts": <contents> }`.
- `frontend-sdk/package.json` — add script `"scaffold:design": "node tools/design-scaffold.mjs"`.

## Contracts
Types: 0001 §C1 character-exact. Default values (FINAL — do not re-decide):
```ts
space:    { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32 }
radius:   { none: 0, sm: 4, md: 8, lg: 12, full: 9999 }
text:     { caption: {12,16,400}, label: {14,20,500}, body: {16,24,400},
            heading: {20,28,600}, title: {25,32,600}, display: {31,40,700} }   // {fontSize,lineHeight,fontWeight}
shadow:   { none: "none", raised: "0 1px 3px rgba(0,0,0,0.12)", overlay: "0 8px 24px rgba(0,0,0,0.16)" }
motionMs: { instant: 0, fast: 100, base: 200, slow: 300 }
breakpoints: { compact: 0, regular: 768, wide: 1200 }
themes.light: { bg:"#f8fafc", surface:"#ffffff", surfaceRaised:"#ffffff", border:"#e2e8f0",
  borderStrong:"#cbd5e1", text:"#0f172a", textMuted:"#64748b", textInverse:"#ffffff",
  primary:"#2563eb", primaryHover:"#1d4ed8", primaryActive:"#1e40af", onPrimary:"#ffffff",
  danger:"#dc2626", dangerHover:"#b91c1c", onDanger:"#ffffff", dangerSurface:"#fef2f2",
  success:"#16a34a", successSurface:"#f0fdf4", warning:"#d97706", warningSurface:"#fffbeb",
  focusRing:"#2563eb" }
themes.dark:  { bg:"#0b1220", surface:"#111a2c", surfaceRaised:"#16213a", border:"#243049",
  borderStrong:"#334766", text:"#e6edf7", textMuted:"#94a3b8", textInverse:"#0f172a",
  primary:"#3b82f6", primaryHover:"#60a5fa", primaryActive:"#2563eb", onPrimary:"#0b1220",
  danger:"#ef4444", dangerHover:"#f87171", onDanger:"#0b1220", dangerSurface:"#2a1416",
  success:"#22c55e", successSurface:"#11251a", warning:"#f59e0b", warningSurface:"#2a2012",
  focusRing:"#60a5fa" }
color = themes.light
```
File header comment (in the template): tokens are the app's values for the Lazuli taxonomy; names
are the convention (DESIGN-CONVENTIONS.md), values are yours; hex lives ONLY here (SKYFE012/026).

## Plan — for the executing agent
1. Read `tools/generate.mjs` + `tools/scaffold-feature.mjs`; copy their structure and voice.
2. Add `renderDesign()` to `generate.mjs` emitting `tokens.ts` with the contract above, typed
   exactly per 0001 §C1 (export the types from the same file; `satisfies` where it helps inference).
3. Write `design-scaffold.mjs` (argv parsing, mkdir, refuse-overwrite, summary output — clone the
   scaffold-feature.mjs shape).
4. Run it targeting `examples/sample-app/frontend/core/src/design/`; commit the output as-is.
5. Write `tokens.test.ts` (cases below). Wire nothing else — `npm run test` picks it up via the
   existing vitest config that already covers the example tree.
6. `npm --prefix frontend-sdk run check` until green.

## Tests first (TDD)
- [ ] `every ColorRole exists in both themes` — light/dark key sets are identical and complete.
- [ ] `spacing follows the 4px grid` — every `space` value % 4 === 0 and the scale is strictly increasing.
- [ ] `type scale is monotonic` — fontSize and lineHeight strictly increase caption→display; lineHeight ≥ fontSize.
- [ ] `interactive pairs exist` — primary/primaryHover/primaryActive distinct; danger/dangerHover distinct.
- [ ] `scaffold refuses overwrite` — second run against the same dir exits non-zero, file untouched.

## Gate
`npm --prefix frontend-sdk run check` is green (typecheck + lint + tests, sample tree included).

## Risks & rollback
- Template and committed instance drift → the instance is generated, never hand-edited in this repo;
  a test re-renders `renderDesign()` and diffs it against the committed file (add as a 6th test).
- Value taste disputes → values are the app's by contract; defaults only need to be coherent.

**Rollback:** revert the commits; nothing imports `design/tokens.ts` until 0003.

## As-Built
Shipped 2026-06-09, commit `04cba31` — as planned (renderDesign + design-scaffold.mjs + canonical
instance + 6 tests incl. the template↔exemplar drift pin). Post-landing: the type-scale test was
rewritten without unchecked indexing (`cc185df` — the example tsconfig runs noUncheckedIndexedAccess);
`scrim` values joined both themes (`37785aa`). Pre-existing debt, unchanged: the example tree has no
standalone tsc leg (deps resolve via vitest aliases until the root npm workspace the roadmap tracks).
