---
id: 0001
title: Design constitution — DESIGN-CONVENTIONS.md
type: techspec
status: done
created: 2026-06-09
completed: 2026-06-09
depends_on: []
parallel_safe: true
test_gate: maker approves taxonomy (one-time, explicit) — see Gate
agent: claude-fable-5
---

# TechSpec — Design constitution

## Approach
Write the constitution as prose + locked contracts, in the exact house style of
`docs/FRONTEND-CONVENTIONS.md` (terse sections, rule-catalog entries, "ship the standard not the
adapter" voice). Every contract below is FINAL — executing agents of 0002–0007 code against this
section verbatim; do not re-decide names, values' structure, or signatures.

## Surface
**Create:**
- `docs/DESIGN-CONVENTIONS.md` — the constitution (sections listed in Plan).

**Modify:**
- `docs/FRONTEND-CONVENTIONS.md` — rewrite the "No prescribed styling system" non-goal bullet:
  mechanism stays the app's; vocabulary (token names, kit shape, ui-door) is now the convention,
  pointer to DESIGN-CONVENTIONS.md. Update the a11y section's last paragraph to note the design band
  promotes web a11y to error once canonical screens land (stage 0005).
- `CLAUDE.md` — add layout line: `docs/DESIGN-CONVENTIONS.md  The design constitution + token taxonomy + SKYFE design band catalog.`
- `AGENTS.md` — identical edit (verbatim mirror).

## Contracts

### C1 — Token taxonomy (the TS types; values land in 0002)
```ts
export type SpaceToken  = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";   // 4px grid: 0 4 8 12 16 24 32
export type RadiusToken = "none" | "sm" | "md" | "lg" | "full";                 // 0 4 8 12 9999
export type TextRole    = "display" | "title" | "heading" | "body" | "label" | "caption"; // 1.25 modular, base 16
export type ShadowToken = "none" | "raised" | "overlay";
export type MotionToken = "instant" | "fast" | "base" | "slow";                 // 0 100 200 300 ms
export type ColorRole =
  | "bg" | "surface" | "surfaceRaised" | "border" | "borderStrong"
  | "text" | "textMuted" | "textInverse"
  | "primary" | "primaryHover" | "primaryActive" | "onPrimary"
  | "danger" | "dangerHover" | "onDanger" | "dangerSurface"
  | "success" | "successSurface" | "warning" | "warningSurface"
  | "focusRing" | "scrim";
export interface TextStyle { fontSize: number; lineHeight: number; fontWeight: 400 | 500 | 600 | 700; }
export declare const space: Record<SpaceToken, number>;
export declare const radius: Record<RadiusToken, number>;
export declare const text: Record<TextRole, TextStyle>;
export declare const shadow: Record<ShadowToken, string>;     // web box-shadow strings; RN maps to elevation
export declare const motionMs: Record<MotionToken, number>;
export declare const themes: { light: Record<ColorRole, string>; dark: Record<ColorRole, string> };
export declare const color: Record<ColorRole, string>;        // = themes.light (default binding)
export declare const breakpoints: { compact: 0; regular: 768; wide: 1200 };
```
Canonical location in an app: `core/src/design/tokens.ts` (hostpoint precedent: tokens live in core).
Names are the convention; values are the app's. `palette`-style raw scales, if an app keeps them, are
private to the tokens file — components touch `color.*` roles only.

### C2 — Kit API (locked signatures; implementation lands in 0003)
Closed API: **no `className`, no `style` prop on any primitive.** Props are token unions.
```ts
Screen({ children })                                                  // page container: color.bg, padding lg
Stack({ children, gap = "md", direction = "vertical", align, padding }: {
  gap?: SpaceToken; direction?: "vertical" | "horizontal";
  align?: "start" | "center" | "end" | "stretch"; padding?: SpaceToken })
Text({ children, role = "body", tone = "default", alert }: {
  role?: TextRole; tone?: "default" | "muted" | "danger" | "inverse"; alert?: boolean })
Button({ label, onPress, variant = "primary", disabled, loading }: {
  label: string; onPress: () => void;
  variant?: "primary" | "secondary" | "danger"; disabled?: boolean; loading?: boolean })
Field({ fieldId, label, hint, error, children })                      // wires htmlFor + aria-describedby to fieldId
Input({ id, value, onChangeText, placeholder, kind = "text", invalid }: {
  id: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; kind?: "text" | "email" | "password" | "number"; invalid?: boolean })
Card({ children, padding = "lg" }: { padding?: SpaceToken })
EmptyState({ title, description })
ErrorState({ title, retryLabel, onRetry })
```
Every interactive primitive implements the five states internally: rest, hover, focus-visible
(2px `color.focusRing` ring, never removed), active, disabled. No state is the consumer's job.

### C3 — SKYFE design band (IDs + intent; implementation lands in 0004)
- **SKYFE024 `ui-door`** — a `*.view.tsx` renders no host elements (lowercase JSX) and carries no
  `style`/`className` JSX attribute; everything visual comes from `@/ui`. The SKYFE002 one-door
  pattern applied to paint.
- **SKYFE025 `scale-only`** — outside `ui/`, token files, and tests: no numeric literals in
  spacing-ish style keys (`padding*`, `margin*`, `gap`, `rowGap`, `columnGap`, `borderRadius`,
  `fontSize`, `lineHeight`) except 0; no Tailwind arbitrary values (`[13px]`) in `className` strings.
- **SKYFE026 `semantic-colors`** — outside token files: no `rgb()/rgba()/hsl()/hsla()/oklch()`
  literals, no CSS named colors in color-ish style keys (`color`, `backgroundColor`, `borderColor`,
  `*Color`), no value-import of a raw palette export outside `ui/`. Completes SKYFE012 (hex).
Catalog entries follow the SKYFE012 format in FRONTEND-CONVENTIONS.md. Warn-first at introduction
(0004), promoted to error with the canonical screens (0005) — the house posture.

### C4 — Constitution rules (prose sections, enforced by C2/C3 or by recipe)
- Spacing only from `space`; vertical rhythm via `Stack gap`, never margin on children.
- One `display`-or-`title` per screen; hierarchy descends without skipping; body is the default.
- Form anatomy, always: `Field` wraps label → control → (hint | error); error replaces hint; the
  control gets `invalid` when error is present; mutation errors surface via the SKYFE013 discipline.
- Color by role, never by value; anything on `primary`/`danger` uses `onPrimary`/`onDanger`.
- Touch targets ≥ 44px; contrast AA against the role pairs; focus ring never suppressed.
- Responsiveness: `breakpoints` tokens; compact-first; layout shifts at `regular`/`wide` only.
- Dark mode = `themes.dark` value swap; no component may branch on theme.

### C5 — Recipe index (forward links; content lands in 0005)
Table mapping screen archetype → canonical file: list → `examples/sample-app/frontend/core/src/items/`,
form → `.../itemForm/` (created in 0005). Marked "canonical — instantiate, do not invent".

## Plan — for the executing agent
1. Read `docs/FRONTEND-CONVENTIONS.md` and `docs/CONVENTIONS.md` fully — match voice, structure, density.
2. Write `docs/DESIGN-CONVENTIONS.md` with sections: Why (determinism for agent-built UI; the four
   layers) → The taxonomy (C1 verbatim + per-scale rationale: 4px grid, 1.25 modular) → The kit
   (C2 verbatim + closed-API rationale) → The five states → Form anatomy → Text hierarchy → Layout &
   spacing → Color discipline → Responsiveness → A11y posture (jsx-a11y/rn-a11y wiring stays; design
   band promotes web to error at 0005) → Theming (values are yours) → The SKYFE design band catalog
   (C3, SKYFE012 cross-referenced) → Recipes (C5) → Non-goals (the Killed list from `.specs/index.md`).
3. Rewrite the FRONTEND-CONVENTIONS.md styling non-goal + a11y note (Surface section above).
4. Add the layout line to `CLAUDE.md`; apply the identical diff to `AGENTS.md`.
5. Self-check: every C1–C5 identifier appears in the doc exactly as written here; no TODO/placeholder
   text; no styling-library prescription anywhere.

## Tests first (TDD)
Doc-only stage — the contract checks are structural:
- [ ] `DESIGN-CONVENTIONS.md` contains the C1 type block and C2 signature block character-exact.
- [ ] Every SKYFE024–026 entry states: what it flags, where it's exempt, the message's "use instead".
- [ ] `FRONTEND-CONVENTIONS.md` no longer claims "the design tokens are the app's choice" un-qualified.
- [ ] `CLAUDE.md` and `AGENTS.md` diffs are byte-identical.

## Gate
Maker reads the taxonomy + kit API once and approves (explicit one-time inspection — methodology §6
escape hatch for non-automatable acceptance). Everything downstream is automated against this doc.

## Risks & rollback
- Taxonomy bikeshed reopens mid-wave → contracts here are FINAL; a change is a new ADR superseding
  0001, never an inline edit after 0002 starts.
- Doc drifts from shipped code later → the recipe index links to real files; 0005's gate lints them.

**Rollback:** revert the doc commits; no code depends on this stage until 0002 lands.

## As-Built
Shipped 2026-06-09, commit `ccd3569` (specs scaffold `1f6c9bd`). Deltas: the band was renumbered
023–025 → 024–026 BEFORE execution — the FRONTEND-CONVENTIONS catalog already reserves SKYFE023 for
the planned orphan-placeholder rule (caught by grounding in the doc, not memory). Two locked
contracts were superseded later in the wave, this spec updated in place both times: C2 `Text` gained
`alert?: boolean` (the form's command-error surface, 0005, `c447c4b`) and C1 `ColorRole` gained
`scrim` (the pauta Dialog backdrop, 0007 inner loop, `37785aa`). Maker approved the taxonomy
2026-06-09.
