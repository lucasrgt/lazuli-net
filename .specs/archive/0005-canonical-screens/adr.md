---
id: 0005
title: Recipes are real compiled screens in the sample, not documentation snippets
type: adr
status: accepted
created: 2026-06-09
supersedes: —
---

# ADR — The recipe catalog is executable sample code; promotion to error rides on it

## Context
Composition guidance can live as prose+snippets in DESIGN-CONVENTIONS.md, as a separate gallery app,
or as real screens in the existing sample. Snippets drift (nothing compiles them); a gallery is a new
app to maintain (multi-app sprawl). The sample already is the canonical-slice mechanism on the
backend — the same move works for screens. Separately: the band (0004) and a11y sit at warn and need
a promotion trigger.

## Decision
Recipes are full feature units in `examples/sample-app/frontend`, held to every rule at error tier —
list (relift) and form (new). The recipe index in the constitution links to the files; the files are
the truth. Landing them is the promotion event: SKYFE024–026 and web jsx-a11y go to error in the same
stage, so "canonical" and "enforced" become the same commit.

## Alternatives considered
- **Prose recipes with code snippets** — rejected: snippets don't compile, don't lint, and rot; the
  doc would become the second source of truth the wave is designed to avoid.
- **A storybook/gallery app** — rejected: a new app + a new dependency to maintain = the multi-app
  sprawl non-goal; the sample already plays this role for the backend slice.
- **Promote rules in a later, separate stage** — rejected: between recipes and promotion the band
  would sit at warn with clean exemplars available — dead air during which agent-built code keeps
  passing; promotion belongs to the same gate that proves it's achievable.

## Consequences
**We accept:** the sample grows a second feature (more surface to keep green); the form recipe pins
the blessed form-lib choice visibly (react-hook-form + zod, matching pauta).
**We gain:** recipes that cannot drift from the rules (CI compiles+lints them at error); a concrete
"copy this" answer for the two highest-frequency screen archetypes; an honest promotion event.
**We watch:** archetypes pilots ask for that have no recipe (dashboard, wizard, settings) — two
independent requests for the same archetype = spec the recipe.
