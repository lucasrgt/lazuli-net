---
id: 0004
title: Three narrow AST rules close the kit's side doors; states/anatomy stay API-enforced
type: adr
status: accepted
created: 2026-06-09
supersedes: —
---

# ADR — The design band polices escape hatches only; what the kit enforces by construction is not linted

## Context
Four candidate enforcement targets: (a) bypassing the kit, (b) off-scale values, (c) raw colors,
(d) interactive states + form anatomy. (a)–(c) are mechanically decidable from the AST. (d) is not:
"has hover/focus/active" and "label precedes control" require rendering or heuristics that misfire —
and the kit already makes them unavoidable (Button owns its states, Field owns its anatomy).

## Decision
Ship exactly three rules — SKYFE024 `ui-door`, SKYFE025 `scale-only`, SKYFE026 `semantic-colors` — as
narrow AST checks with the same exemption boundaries the constitution locks (`ui/`, token files,
tests). States and anatomy are NOT linted; they are guaranteed by the closed kit API (0003) plus the
recipes (0005). Warn-first introduction, error at 0005 — the proven a11y/backlog posture.

## Alternatives considered
- **Lint interactive states / form anatomy** — rejected: undecidable statically; heuristic versions
  produce false positives that teach agents to suppress, the worst outcome for a harness.
- **One mega-rule "design-system"** — rejected: per-concern rules match the SKYFE catalog grain,
  carry separate messages ("use the kit" vs "use a token"), and promote to error independently.
- **Extend SKYFE012 in place instead of SKYFE026** — rejected: 012 is shipped and pinned in pilot
  configs/docs; changing its semantics mid-flight breaks the mirror-rebase contract. 026 composes
  beside it; both are cataloged as the color pair.
- **Stylelint for CSS files** — rejected: the canonical kit emits no CSS; apps with CSS pick their
  own stylelint — wiring another linter into the harness is mechanism prescription.

## Consequences
**We accept:** the band cannot catch every aesthetic crime (a legal-token ugly screen survives lint —
recipes and the skill exist for that); SKYFE025's key list is a curated subset (spacing/typography),
not exhaustive CSS.
**We gain:** every side door named by the constitution has a tripwire; messages double as agent
teaching (each names the door to use instead); pilots inherit the band by the normal mirror rebase.
**We watch:** suppression comments (`eslint-disable`) appearing in pilot views — each one is either a
missing kit primitive (harvest, 0007) or a rule bug (fix here); never a blessed pattern.
