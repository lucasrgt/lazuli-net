---
id: 0001
title: Design constitution — DESIGN-CONVENTIONS.md
type: prd
stage: 1 of 7
status: ready
created: 2026-06-09
---

# PRD — Design constitution

## Problem
Agent-built UIs in Lazuli apps come out visually inconsistent ("porca", per the maker): arbitrary
spacing, forked palettes, unaligned typography, ad-hoc form layouts. The framework stops at the data
seam (`FRONTEND-CONVENTIONS.md` is styling-neutral by construction); SKYFE012 forbids inline hex but
defines nothing to use instead. Every app reinvents design from zero and every agent invents layout
per-screen. There is no contract for later stages (tokens, kit, lint band, recipes) to build against.

## Why now (or why ever)
Without a locked vocabulary, stages 0002–0007 collide on the same undefined boundary (token names,
kit API, rule IDs) and pilots keep shipping inconsistent UI. This stage is the "lock shared contracts
first" move — everything else in the wave parallelizes only after it lands.

## Outcome — done means
- `docs/DESIGN-CONVENTIONS.md` exists: token taxonomy (exact TS type signatures), scale values'
  structure (4px grid, 1.25 modular type scale), semantic color roles, the five interactive states,
  form-field anatomy, text hierarchy, layout/spacing rules, kit API surface (locked signatures),
  SKYFE024–026 catalog entries, recipe index (forward links to 0005 paths), a11y posture.
- `docs/FRONTEND-CONVENTIONS.md` non-goal "No prescribed styling system" is rewritten: Lazuli stays
  **mechanism**-neutral (styling library is the app's) but now prescribes the **vocabulary** (token
  names, kit shape, ui-door).
- `CLAUDE.md` + `AGENTS.md` repository-layout table gains the `docs/DESIGN-CONVENTIONS.md` line.

## Non-goals
- No code, no packages, no lint rules — prose + locked contracts only.
- No styling-library prescription (NativeWind/Tailwind/StyleSheet stay the app's choice).
- No TOML/JSON machine spec — prose for why/when, code (later stages) for what.
- No component beyond the locked v1 kit list (no Dialog/Select/Tabs/Toast/DataTable).
- No icon set, no motion system beyond duration tokens.

## User stories
- As an executing agent on stages 0002–0007, I read one doc and get every name, type, and signature
  already decided, so I never invent vocabulary.
- As a coding agent in a pilot app, I look up "how do I space things / which color role / what does a
  form look like" and get one answer.

## Constraints
- Doc style must match `docs/CONVENTIONS.md` / `docs/FRONTEND-CONVENTIONS.md` (terse, rule-catalog format).
- `AGENTS.md` is a verbatim mirror of `CLAUDE.md` — both files change identically.
- Must survive the CLAUDE.md smell test: vocabulary + enforcement, never capability.

## Open questions
None — taxonomy, kit API, and rule IDs are decided in the techspec.
