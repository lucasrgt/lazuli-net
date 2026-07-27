---
id: 0006
title: Design skill — the context loader for UI work
type: techspec
status: done
created: 2026-06-09
completed: 2026-06-09
depends_on: [0005]
parallel_safe: true
test_gate: node -e "for (const p of ['.claude/skills/lazuli-design/SKILL.md','templates/lazuli-app/.claude/skills/lazuli-design/SKILL.md']) require('fs').accessSync(p)" && git diff --no-index .claude/skills/lazuli-design/SKILL.md templates/lazuli-app/.claude/skills/lazuli-design/SKILL.md
agent: claude-fable-5
---

# TechSpec — Design skill (lazuli-design)

## Approach
One SKILL.md, written once, copied to the template; the gate enforces existence + byte-identity.
Content is the locked skeleton below — the executing agent polishes wording, never adds sections or
rule content.

## Surface
**Create:**
- `.claude/skills/lazuli-design/SKILL.md` — canonical copy.
- `templates/lazuli-app/.claude/skills/lazuli-design/SKILL.md` — byte-identical copy.

**Modify:**
- `docs/DESIGN-CONVENTIONS.md` — one line in the recipes section: "agents: the lazuli-design skill
  routes you here; instantiate, do not invent."

## Contracts
SKILL.md skeleton (FINAL — sections and their intent; ≤ 60 lines total):
```markdown
---
name: lazuli-design
description: Use when creating or modifying any UI — screens (*.view.tsx), ui/ primitives,
  forms, or visual styling in a Lazuli app. Loads the design constitution and the matching
  recipe, then enforces the exit ritual.
---
# lazuli-design — build UI by instantiation, never invention

## 1. Load (before writing any JSX)
- Read docs/DESIGN-CONVENTIONS.md: the taxonomy + the section matching the task
  (form anatomy / text hierarchy / layout / color discipline).
  [In a pilot: the constitution lives in the framework checkout declared in
  Lazuli.toml [framework] repo.]
- Open the recipe the constitution's recipe index maps to this screen archetype;
  open its four files (view, viewModel, test, i18n).

## 2. Build
- Instantiate the recipe: copy its structure, rename, bind your slice. Do not
  compose a screen from a blank file.
- Vocabulary is closed: kit primitives + token props only. A missing primitive is
  extended in YOUR ui/ following the constitution — never inlined paint
  (SKYFE024–026 will catch it; don't make them).

## 3. Verify (the exit ritual — all three, in order)
1. Lint/check green (the app's check command — sample: npm run check).
2. Render the screen; take a screenshot.
3. Self-review against: visual hierarchy (one title, descending roles) · spacing
   rhythm (token scale only) · five states on every interactive · contrast pairs
   (onPrimary/onDanger on their surfaces) · form anatomy (label→control→hint|error).
   Fix what fails; re-render until it reads clean.
```

## Plan — for the executing agent
1. Read DESIGN-CONVENTIONS.md (recipes index section) and two existing skills for front-matter
   format conventions.
2. Write the canonical SKILL.md from the skeleton; keep ≤ 60 lines; pointers only — verify no token
   value, kit prop list, or rule text got embedded.
3. Copy to the template path; add the one-line pointer in DESIGN-CONVENTIONS.md.
4. Run the gate (existence + byte-identity).

## Tests first (TDD)
- [ ] Both SKILL.md files exist — gate's first leg.
- [ ] Byte-identical — gate's `git diff --no-index` leg exits 0.
- [ ] Every path the skill references resolves in this repo (manual check at review: the doc, the
      recipe index, Lazuli.toml mention).

## Gate
The `test_gate` command exits 0 **and** the maker (or reviewing agent) confirms the skill stayed
pointer-only (no embedded rules/values — the one non-automatable check).

## Risks & rollback
- Skill drifts from constitution structure (section renames) → the skill references sections by
  topic, not anchor links; constitution renames don't break it.
- Template copy forgotten on future edits → the gate's byte-identity check runs in CI with the
  specs' other checks; editing one file alone fails it.

**Rollback:** delete both files; nothing depends on the skill.

## As-Built
Shipped 2026-06-09, commit `6f52d71` — as planned: 41 lines, pointer-only, repo + template copies
byte-identical (hash-verified), the constitution's recipes section carries the routing line. The
skill registered immediately (it appears in this session's skill roster as `lazuli-design`).
