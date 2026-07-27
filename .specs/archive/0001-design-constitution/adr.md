---
id: 0001
title: Vocabulary, not mechanism — the design layer ships names, shapes, and enforcement
type: adr
status: accepted
created: 2026-06-09
supersedes: —
---

# ADR — Lazuli prescribes the design vocabulary (token names + kit API), never the styling mechanism

## Context
Agent-built UI is non-deterministic: every unconstrained decision (a px value, a hex, a layout) is a
decision an agent makes differently each time. The existing posture ("no prescribed styling system")
leaves 100% of design decision space open. The two failure modes to avoid are documented in CLAUDE.md:
owning apparatus (Lazuli-1) and capability sprawl (aerocoding — explicitly including frontend/UI
generation). Hostpoint already proved tokens migrate to `core/` when an app matures.

## Decision
We prescribe the design **vocabulary** and enforce it, in four layers of decreasing strength:
1. **Closed API** — kit primitives whose props are unions of token names (wrong = inexpressible).
2. **Lint band** — SKYFE024–026 catch the escape hatches (wrong = detectable).
3. **Canonical screens** — recipes agents instantiate instead of inventing layout (right = copyable).
4. **Skill** — loads constitution + recipe into agent context at build time (right = loaded).
Token **names and types** are the convention; token **values** are the app's (that is the whole
theming story). The styling **mechanism** (CSS vars, NativeWind, StyleSheet) stays the app's choice.
The single source of token truth is one plain TS file (`tokens.ts`) the app owns. The constitution is
Markdown prose, sibling to CONVENTIONS.md / FRONTEND-CONVENTIONS.md.

## Alternatives considered
- **Published `@lazuli/ui` component library** — rejected: versioned UI lib = theming API surface +
  breaking releases + RN/web matrix; the exact aerocoding/MUI vector. Scaffolded code-you-own instead.
- **TOML/JSON design spec as the source of truth** — rejected: duplicates what `tokens.ts` already
  states executably (drift by construction) and is the ".ctx.md stays prose" mini-language vector.
- **Keep styling-neutral (status quo)** — rejected: it is the bleed. The sample's `ui.tsx` (inline
  styles, `className` passthrough, no tokens) is what neutrality produces.
- **Source-generate UI from specs** — rejected without discussion: forbidden by CLAUDE.md.

## Consequences
**We accept:** a posture change in FRONTEND-CONVENTIONS.md (vocabulary is now prescribed); apps that
already have a design system (hostpoint) must alias their tokens onto the taxonomy; the kit's closed
API will occasionally frustrate a legitimate one-off (the answer is: extend the kit in your app, the
ui/ folder is yours).
**We gain:** agent decision space collapses to token unions + recipe choice; visual consistency stops
depending on agent taste; the doctor can finally police paint; dark mode and white-label become a
value swap.
**We watch:** if pilots routinely fork the kit API (not just values), the vocabulary is wrong —
reopen this ADR.
