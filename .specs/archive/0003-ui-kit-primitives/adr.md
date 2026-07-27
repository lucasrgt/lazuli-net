---
id: 0003
title: Closed-API kit, scaffolded per app, styled by inline token lookup
type: adr
status: accepted
created: 2026-06-09
supersedes: —
---

# ADR — The kit closes its API (no className/style) and styles via inline token lookup

## Context
Agent determinism is highest when wrong values are inexpressible (0001 ADR layer 1). The current
`ui.tsx` passes `className` through — every consumer can bypass any convention. The kit must also
work with zero styling dependencies (the sample has none) and test in jsdom.

## Decision
Primitives expose ONLY token-union props (0001 §C2). No `className`, no `style`, no `as`, no render
props. Styling is computed inline from `tokens.ts` (`style={{ padding: space[padding] }}`); state
styling (hover/focus/active) via minimal local state + handlers in the web impl, `Pressable` state in
RN. The kit is scaffolded into the app (`ui/` is the app's code); extension = adding primitives in
your `ui/`, following DESIGN-CONVENTIONS.md — never reopening the shipped ones.

## Alternatives considered
- **`className` escape hatch "for flexibility"** — rejected: one escape hatch re-opens 100% of the
  decision space; the door must actually close or SKYFE024 polices a fiction.
- **Tailwind/NativeWind in the kit** — rejected: prescribes the mechanism (explicitly the app's),
  adds a build dependency to the sample, and arbitrary-value syntax is the exact leak SKYFE025 hunts.
- **CSS modules / stylesheet file** — rejected for the canonical kit: a second styling source beside
  tokens.ts; inline lookup keeps token → pixel one greppable hop. (An app may refactor its own kit
  to its mechanism — the API contract is what's conventional.)
- **Headless lib (radix/react-aria) under the hood** — rejected for v1 scope: the v1 set (no
  overlays) doesn't need it; a dependency is a thing that breaks. Reconsider only if Dialog ever
  joins the kit (it would be the app's call anyway).

## Consequences
**We accept:** one-off visual tweaks require extending the app's kit (friction by design); inline
styles mean no pseudo-class CSS — states are JS-driven in the web impl (fine at kit scale).
**We gain:** the prop surface IS the constraint system; screens are visually uniform by
construction; tests assert tokens, not pixels.
**We watch:** pilots adding `className` back to their scaffolded kit — that signals a missing
primitive or token, not a missing escape hatch; harvest it (0007) instead of blessing the hatch.
