---
id: 0007
title: Pauta design dogfood — wire the design layer into the worst-UI pilot, harvest the gaps
type: techspec
status: done
created: 2026-06-09
completed: 2026-06-09
depends_on: [0003, 0004, 0005]
parallel_safe: true
test_gate: pnpm --dir C:\Users\lucas\dev\pauta-web\frontend lint && pnpm --dir C:\Users\lucas\dev\pauta-web\frontend test
agent: claude-fable-5
---

# TechSpec — Pauta design dogfood

## Approach
Install the layer in dependency order (mirror → tokens → kit → relift), keeping the band warn-first
globally and error-tier only on the new surfaces (`ui/`, the relifted feature). The relift is an
instantiation of the 0005 recipes, not a redesign: structure and vocabulary come from the recipes;
pauta's brand lives in the token VALUES. Everything the layer cannot express cleanly is written down,
not worked around — the report is a deliverable, not a byproduct.

## Surface
All paths under `C:\Users\lucas\dev\pauta-web\frontend\` unless noted.

**Create:**
- `eslint-plugin-lazuli/` — the mirror: copy `index.cjs` + `index.test.cjs` from
  `lazuli-net/frontend-sdk/packages/eslint-plugin/` verbatim (0.5.0). Never edited here.
- `src/design/tokens.ts` — scaffolded (`design-scaffold.mjs`), then values replaced with pauta's
  actual palette/brand (extract dominant colors from `tailwind.config.ts` + globals.css).
- `src/ui/` — scaffolded web kit (`design-scaffold.mjs --kit web`), pauta-owned.
- `src/ui/Dialog.tsx` — the rebuilt modal primitive (contract below).
- `docs/design-relift-worklist.md` (pauta repo) — every screen, ranked by violation count, the
  fan-out wave's dispatch list.

**Modify:**
- `eslint.config.mjs` — register the mirror; enable `design-tokens`(012), `ui-door`(024),
  `scale-only`(025), `semantic-colors`(026): `"warn"` globally, `"error"` for
  `src/ui/**` and the relifted feature dir.
- `tailwind.config.ts` — theme extends FROM `tokens.ts` (import + map: colors←color roles,
  spacing←space, borderRadius←radius, fontSize←text). Tailwind classes become token-conformant;
  this instance becomes the documented mapping's reference.
- The exemplar feature (the screen owning the gross modal — identify in step 1): relift to the
  blessed unit shape (`<Feature>.view.tsx` + `.viewModel.ts` + test + i18n optionalized — see
  Contracts) instantiating the 0005 list/form recipes.
- `lazuli-net/docs/PORTBACK-CHECKLIST.md` — harvest findings appended (the ONLY lazuli-net edit).

## Contracts
- **Mirror law:** mirror files are byte-copies; any needed rule change happens in lazuli-net first,
  then re-copy (package-first law — `framework-sync.mjs` posture even before pauta wires it).
- **Dialog (pauta-owned, constitution-conformant):**
  `Dialog({ open, onClose, title, children, footer })` — overlay `shadow.overlay` on
  `color.surfaceRaised`, radius `lg`, padding `xl`; `role="dialog" aria-modal aria-labelledby`
  (title); Esc + backdrop click → `onClose`; focus moves in on open, returns on close; Tab cycles
  inside (minimal trap: first/last sentinel, no dependency). This is kit-v2 candidate evidence, not kit code.
- **Relift bar:** the relifted `.view.tsx` passes SKYFE024 at error — zero host elements, zero
  className — i.e. it consumes `@/ui` only. Where pauta's existing copy/i18n setup doesn't match the
  sample's (`*.i18n.ts`), keep pauta's current copy mechanism and note the delta in the report
  (i18n harness adoption is the other wave; do NOT import SKYFE011/014 obligations here).
- **Harvest report format** (appended to PORTBACK-CHECKLIST.md): per rule — fired count, true/false
  positive split with one example each; missing vocabulary — primitive/token/recipe requests with
  the screen that needed them; verdict line per item: `portback | narrow-rule | app-owned`.

## Plan — for the executing agent
1. Survey: `pnpm lint` baseline; list `src/app` routes + `src/features/*` screens; find the modal
   (grep `modal|dialog|overlay|fixed inset` in src/) and its owning screen — that pair is the exemplar.
2. Copy the mirror; wire `eslint.config.mjs` (band warn globally); run lint; record per-rule counts
   — this is the worklist's raw data and the report's "before" number.
3. Scaffold `src/design/tokens.ts`; replace default values with pauta's palette (keep ALL role names
   — if a brand color has no role, that's a finding); map `tailwind.config.ts` from it.
4. Scaffold `src/ui/` (web kit); adjust the `@/ui` path alias in `tsconfig.json`.
5. Build `Dialog.tsx` per the contract, tests first (focus, Esc, aria wiring — vitest+jsdom exists).
6. Relift the exemplar: instantiate the 0005 recipe shapes; replace the old modal usage with
   `Dialog`; promote the band to error for `src/ui/**` + the exemplar dir; fix to green.
7. Write the worklist (ranked by step-2 counts) and the harvest report; append the report to
   `lazuli-net/docs/PORTBACK-CHECKLIST.md`.
8. Gate green; commit per-concern (mirror / tokens+tailwind / kit / dialog / relift / docs).

## Tests first (TDD)
- [ ] `Dialog: opens with focus inside, Esc and backdrop call onClose, focus returns on close` —
- [ ] `Dialog: role=dialog, aria-modal, labelled by its title` —
- [ ] `exemplar screen renders list/form recipe states (loading/empty/error/ready; field errors)` —
- [ ] `exemplar + ui/ lint clean at error tier` — the scoped-promotion proof.
- [ ] `tailwind theme resolves from tokens.ts` — a unit test importing the config and asserting
      `theme.colors.primary === color.primary`.

## Gate
`pnpm lint && pnpm test` green in pauta frontend (band error-tier on new surfaces, warn elsewhere)
**and** the harvest report exists in both repos **and** the maker eyeballs the relifted screen +
Dialog once (the "asqueroso → recipe-grade" check is visual by nature).

## Risks & rollback
- SKYFE025 noise on Tailwind idioms → expected; that's harvest data. If >50% false positives, stop
  relifting, file the narrowing as a 0004 follow-up finding, continue with 012/024/026 only.
- Pauta brand doesn't fit the role taxonomy → finding with `portback` verdict (taxonomy gap beats
  local fork); never invent role names locally.
- Next.js App Router specifics (server components can't hold kit state handlers) → kit usage stays
  in client components (screens already are); if a server-component boundary forces a kit change,
  that's a top-priority portback finding.

**Rollback:** pauta changes are additive + one feature dir; revert the relift commit and the app is
where it started, mirror and tokens inert at warn.

## As-Built
Shipped 2026-06-09 — pauta commits `2f735764` (mirror+band) · `4be9a905` (tokens+tailwind) ·
`370b16ec` (kit+Dialog) · `0c9d495d` (exemplar relift) · `b578574b` (worklist); lazuli-net `37785aa`
(scrim, inner loop) + `f0cae35` (harvest). Deltas: the "gross modal" turned out to be
`window.confirm` on every detail page — rebuilt as the app-owned Dialog (scrim/overlay tokens, focus
in/return, Esc/backdrop, sentinel trap; 4 tests). The exemplar is `billing-type-edit` (form recipe;
audit/soft-delete fields dropped from the form — the partial update schema makes the narrower
payload legal). Pauta's palette IS the default theme (aerocoding used stock Tailwind blue/red), so
token values needed no edits. The baseline produced the headline finding: the band fired **0× over
533 files** — Tailwind utility classes are invisible to it (HIGH portback). The mirror was rebased
mid-stage to 0.6.0 when the mutation band (SKYFE027/028) landed in parallel. `'use client'` added
app-side to the hooky primitives (template-portback candidate). Gate: lint 0 errors, 456 tests green
(98 files, 8 new). Maker eyeballed and approved 2026-06-09. The full-app relift is the next wave
(`pauta-web/frontend/docs/design-relift-worklist.md`).
