---
id: 0007
title: Pauta is the design pilot; hostpoint is conditional and aesthetics-frozen
type: adr
status: accepted
created: 2026-06-09
supersedes: —
---

# ADR — Dogfood on the ugliest pilot (pauta), prove-then-fan-out; hostpoint only as a frozen-aesthetics aliasing, later

## Context
Two pilots exist (package-first law). Hostpoint's UI is finished — the maker's constraint is
explicit: it may only ever adopt the layer if aesthetics and structure stay byte-for-eye unchanged.
Pauta is aerocoding-generated, visually broken everywhere ("todas as telas"), Next+Tailwind, zero
Lazuli wiring. A design layer's claim is "good defaults emerge from the tools" — that claim is only
testable where the starting point is bad.

## Decision
Pauta is the pilot. The stage wires the full design layer (mirror + band warn-first, tokens with
pauta's palette as values, scaffolded kit) but relifts only the worst unit — the modal (rebuilt as
pauta-owned `ui/Dialog`) plus its screen, instantiated from the 0005 recipes at error tier. The
remaining screens become a counted, ranked worklist dispatched as per-feature cells in a follow-up
wave. Hostpoint is deferred and conditional: if it ever adopts, it is a pure token-aliasing refactor
with zero visual delta, specced only after the pauta harvest is digested.

## Alternatives considered
- **Hostpoint as pilot** — rejected: finished UI means every diff is risk with no upside; "keep the
  pixels identical" inverts the dogfood (it tests nothing about producing good UI from bad).
- **Full pauta relift in one stage** — rejected: violates one-agent-one-run sizing; produces an
  unreviewable mega-diff; and relifting 100% of screens against an unproven pattern multiplies any
  pattern error by N screens.
- **Lint-only harvest (no relift)** — rejected: warn counts measure violations, not whether the kit
  + recipes actually transfer to Next+Tailwind; one real screen + the modal is the minimum honest probe.
- **Adopt the full SKYFE harness while we're there** — rejected: scope explosion (MVVM restructure of
  six feature dirs); the design band is separable by construction — prove it separately.

## Consequences
**We accept:** pauta temporarily lives in two visual worlds (relifted exemplar vs legacy screens)
until the fan-out wave; the mirror lands in a repo without the rest of the harness (band-only config).
**We gain:** the layer is tested exactly where it must win; the modal — the named worst offender —
becomes the constitution's first real overlay, feeding the Dialog-in-kit decision with evidence; the
fan-out wave starts with a proven pattern and a ranked worklist instead of faith.
**We watch:** the harvest's false-positive rate on Tailwind idioms (SKYFE025's arbitrary-value regex
meeting real-world classes) — high noise there means the rule needs narrowing BEFORE the fan-out wave.
