---
id: 0007
title: Pauta design dogfood — wire the design layer into the worst-UI pilot, harvest the gaps
type: prd
stage: 7 of 7
status: ready
created: 2026-06-09
---

# PRD — Pauta design dogfood

## Problem
Pauta (`C:\Users\lucas\dev\pauta-web\frontend` — Next 15 + Tailwind, aerocoding-generated) is the
maker's words: "uma porquisse, todas as telas, o modal esta asqueroso". It has no shared `ui/`, no
tokens, no Lazuli wiring at all — it IS the agent-built-UI failure this wave exists to kill, which
makes it the highest-signal pilot. Hostpoint is NOT the pilot: its UI is finished; touching it risks
an aesthetic it must keep.

## Why now (or why ever)
A design layer proven only on its own sample is unproven. The doctor's history (SKY0022–26, SKYFE020)
shows rules get real on pilot contact — the fallout IS the feature. Pauta gives maximal fallout
density; without this stage the wave ships theory.

## Outcome — done means
- Pauta frontend carries the rebased `eslint-plugin-lazuli` mirror (0.5.0) with the design band
  (SKYFE012, 024–026) wired warn-first, per the package-first law.
- Tokens scaffolded (`core … src/design/tokens.ts` equivalent path) with pauta's actual palette as
  values; mapped into `tailwind.config.ts` (the documented manual mapping, proven here).
- The web kit scaffolded as pauta-owned `ui/`; the gross modal rebuilt as pauta's `ui/Dialog`
  following the constitution; ONE exemplar screen relifted by instantiating the 0005 recipes, blessed
  shape included (`*.view.tsx` naming, so SKYFE024 bites).
- Exemplar + `ui/` lint clean with the band at ERROR (scoped); rest of the app at warn = the counted backlog.
- Harvest report: per-rule violation counts, false positives, missing primitives/tokens/recipes →
  appended to `docs/PORTBACK-CHECKLIST.md` in lazuli-net + the relift worklist for the fan-out wave.

## Non-goals
- **No full-app relift here** — "todas as telas" happens as the NEXT wave: per-feature cells
  dispatched from this stage's worklist, after the pattern is proven on one screen + the modal.
- **No full SKYFE harness adoption** (MVVM restructure, data-door, i18n parity across pauta) — a
  separate, bigger wave; only the design band lands now.
- **No hostpoint contact** — deferred, conditional (see index: zero-visual-delta aliasing only,
  after this harvest is digested).
- No backend changes in pauta; no Dialog portback to the kit yet (it's the harvest's first candidate).

## User stories
- As the maker, I open the relifted pauta screen and the rebuilt modal and they look like the sample
  recipes — proof the layer transfers to a real, ugly app without me decorating anything.
- As the framework, I receive a ranked list of what the vocabulary lacked the moment it met reality.

## Constraints
- Runs in the pauta repo; lazuli-net changes are limited to PORTBACK-CHECKLIST.md (+ a copied mirror,
  never edited on the pauta side — mirror edits are the leak the package-first law forbids).
- Pauta's visual identity (brand colors) goes INTO the token values — the taxonomy must absorb it,
  not replace it; if it can't, that's a finding, not a workaround.
- The exemplar screen choice: the one the modal belongs to (fix the worst thing first, together).

## Open questions
None — anything ambiguous found mid-flight is a harvest finding by definition.
