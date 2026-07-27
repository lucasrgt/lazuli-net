---
id: 0005
title: Canonical screens — the recipe catalog in the sample app
type: techspec
status: done
created: 2026-06-09
completed: 2026-06-09
depends_on: [0003, 0004]
parallel_safe: true
test_gate: npm --prefix frontend-sdk run check
agent: claude-fable-5
---

# TechSpec — Canonical screens (recipes)

## Approach
Relift `items/` onto the kit, then build `itemForm/` as a sibling blessed unit by scaffolding
(`scaffold-feature.mjs`) and shaping it into the form recipe. Promote SKYFE024–026 + web jsx-a11y to
error in the same change — the recipes are the proof the bar is reachable. Update the constitution's
recipe index from forward links to real links.

## Surface
**Create:**
- `examples/sample-app/frontend/core/src/itemForm/ItemForm.viewModel.ts` — create-item command:
  react-hook-form + zod schema, mutation via the generated client, error surfaced per SKYFE013.
- `.../itemForm/ItemForm.view.tsx` — THE form recipe: `Screen > Stack > Text(title) > Card >
  Field+Input per field > Button(primary, loading while pending)`; mutation error as a
  `Text(tone="danger") role="alert"` block above the submit; success path navigates declaratively.
- `.../itemForm/ItemForm.test.tsx` — behavior tests (below).
- `.../itemForm/itemForm.i18n.ts` — ptBR/esES/enUS, full parity (SKYFE011).

**Modify:**
- `examples/sample-app/frontend/core/src/items/Items.view.tsx` — relift to the recipe shape:
  `<Resource>` branches rendered with kit states (`EmptyState`, `ErrorState` with retry), rows as
  `Card`, title as `Text role="title"`.
- `examples/sample-app/frontend/core/src/i18n.ts` — assemble the new namespace.
- `frontend-sdk/eslint.config.mjs` — SKYFE024–026 `warn → error`; jsx-a11y block for the sample web
  tree `toWarn(...) → error` (keep the documented per-rule opt-outs if any rule is structurally
  inapplicable; each opt-out carries a comment naming why).
- `docs/DESIGN-CONVENTIONS.md` — recipe index: real paths + one-line "when to use" per recipe.
- `docs/FRONTEND-CONVENTIONS.md` — a11y section: web promoted to error note.

## Contracts
- Form recipe shape (FINAL — what agents copy): zod schema named `<Feature>Schema` co-located in the
  viewModel; `useForm` lives in the viewModel, the View receives `{ fields, errors, submit,
  submitting, submitError }` — the View stays data-layer-free (SKYFE001) and the VM platform-agnostic
  (SKYFE009). Field-level errors render in `Field error=`; the mutation error renders as the
  `role="alert"` block. Submit button: `loading={submitting}`.
- If `client.gen/sample.ts` lacks a create endpoint: bind the form to the closest existing write; if
  none exists, STOP and report — backend changes are out of scope (PRD).
- Detail recipe: in scope only if get-by-id exists in the generated client; otherwise skip silently
  (PRD non-goal) and note it in As-Built.

## Plan — for the executing agent
1. Read `items/` (all four files), `client.gen/sample.ts`, the kit (`web/src/ui/`), and
   DESIGN-CONVENTIONS.md §form anatomy + §recipes.
2. Check the blessed form-lib state: if react-hook-form + zod are not yet deps of the frontend-sdk
   workspace, add them (devDeps, workspace root — pilots already standardize on them).
3. Write `ItemForm.test.tsx` first (cases below, red).
4. Build the viewModel per the contract; then the View; then i18n with full parity.
5. Relift `Items.view.tsx`; keep its existing tests green (amend assertions only where the kit
   changed semantics — e.g. roles/landmarks, never behavior).
6. Promote the rules in `eslint.config.mjs`; run lint; fix what the promotion reveals IN THE SAMPLE
   (the recipes must be exemplar-clean; rule changes are out of scope — a false positive is a 0004
   bug: stop and report).
7. Update both docs; `npm --prefix frontend-sdk run check` until green.

## Tests first (TDD)
- [ ] `submits a valid form and calls the create endpoint once` — happy path through the VM seam.
- [ ] `field-level zod errors render inside Field and block submit` — anatomy + validation visual.
- [ ] `mutation failure surfaces as role=alert and the button leaves loading` — SKYFE013 made visible.
- [ ] `submit button disables and announces while pending` — aria-busy contract from 0003.
- [ ] `i18n parity across ptBR/esES/enUS for the new namespace` — SKYFE011 green by construction.
- [ ] `Items renders kit EmptyState on empty and ErrorState with working retry on error` —
- [ ] `sample tree lints clean with SKYFE024–026 and jsx-a11y at error` — the promotion proof.

## Gate
`npm --prefix frontend-sdk run check` is green with the promoted (error-tier) config — that single
command now proves: recipes compile, tests pass, band + a11y hold at error.

## Risks & rollback
- Promotion reveals pre-existing sample violations beyond the recipes → fix the sample (it must be
  exemplar-grade); if a fix requires a kit/rule change, stop and report (0003/0004 gap).
- Items test churn from the relift → assertions follow the seam (`@/ui` names), which is stable.

**Rollback:** revert; the promotion commit and the recipe commits are separate, so the band can drop
back to warn without losing the screens.

## As-Built
Shipped 2026-06-09, commit `c447c4b`. Deltas: the form recipe is **`deposit/`**, not `itemForm/` —
the contract's own escape hatch ("bind to the closest existing write"): the sample backend has no
Items module at all (Wallets only), so the recipe mirrors the REAL Deposit slice (SKY0012 1:1;
stand-in mutation hook with a NotFound sentinel + observable pending). `Text` gained `alert` (C2
supersession) as the command-error surface. The detail recipe deferred per the PRD (no get-by-id in
the client). Learnings pinned in code: zod 4 validates UUID version/variant bits (test UUIDs must be
real v4s); jsx-a11y's `aria-role` needs `ignoreNonDOM` (the kit's `Text role=` is a TextRole, not
ARIA). Workspace devDeps gained react-hook-form/zod/@hookform/resolvers (+ vitest aliases).
Promotion proof: 33 files, 0 findings with the band + web jsx-a11y at error; 109 tests green.
