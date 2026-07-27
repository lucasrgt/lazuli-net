---
id: 0004
title: SKYFE design band — ui-door, scale-only, semantic-colors
type: techspec
status: done
created: 2026-06-09
completed: 2026-06-09
depends_on: [0001]
parallel_safe: true
test_gate: npm --prefix frontend-sdk run check
agent: claude-fable-5
---

# TechSpec — SKYFE design band (SKYFE024–026)

## Approach
Three additions to the `rules` object in `packages/eslint-plugin/index.cjs`, following the house
pattern exactly (file-class predicates up top, rationale comment above each rule, `SKYFE0NN:` message
prefix, `meta.docs.description`). Tests extend `index.test.cjs` with the same harness the existing 22
rules use. No new files, no new deps.

## Surface
**Modify:**
- `frontend-sdk/packages/eslint-plugin/index.cjs` — add `isUiKit` predicate + rules `ui-door`,
  `scale-only`, `semantic-colors`; bump `meta.version` to `0.5.0`.
- `frontend-sdk/packages/eslint-plugin/index.test.cjs` — cases below.
- `frontend-sdk/packages/eslint-plugin/package.json` — version 0.5.0.
- `frontend-sdk/tools/doctor.mjs` — map `"lazuli/ui-door": "SKYFE024"`, `"lazuli/scale-only":
  "SKYFE025"`, `"lazuli/semantic-colors": "SKYFE026"`.
- `frontend-sdk/eslint.config.mjs` — register the three at `"warn"` in the `{core,web}` block, with
  a comment noting 0005 promotes them.
- `frontend-sdk/packages/eslint-plugin/README.md` — catalog rows for 024–026.

## Contracts
Shared predicate: `const isUiKit = (f) => /(^|\/)ui(\/|\.)/.test(f.replace(/\\/g, "/"));`
Token-file exemption: reuse SKYFE012's regex `/(^|\/|\.)(theme|tokens|palette|colors)(\/|\.|$)/i`.

**SKYFE024 `ui-door`** — applies to `isView(f)` only:
- Report `JSXOpeningElement` whose name is an `JSXIdentifier` starting lowercase (host element).
- Report any `JSXAttribute` named `style` or `className`, on any element.
- Messages: `host` → "SKYFE024: a View renders no host element (`<{{tag}}>`) — compose `@/ui`
  primitives; if one is missing, extend the kit (ui/ is yours), never inline the paint." ;
  `attr` → "SKYFE024: no `{{attr}}` in a View — visual decisions live in `@/ui` props (token unions),
  not free-form styling."

**SKYFE025 `scale-only`** — applies to production `.tsx`/`.ts`, skips `isTest`, `isUiKit`, token files:
- `SPACING_KEYS = /^(padding|margin)([A-Z].*)?$|^(gap|rowGap|columnGap|borderRadius|fontSize|lineHeight)$/`
- Report `Property` with key matching, inside any object literal in a JSX `style` attribute or a
  `StyleSheet.create` argument, whose value is a numeric literal not `0` (or a string `/^\d+(px|rem|em)$/`).
- Report string literals/template chunks in a `className` attribute containing `/\[\d+(\.\d+)?(px|rem|em|%)\]/`
  (Tailwind arbitrary value).
- Message: "SKYFE025: `{{key}}: {{value}}` is off-scale — spacing/typography come from the tokens
  (`space`/`text` in design/tokens.ts), reached through `@/ui` props."

**SKYFE026 `semantic-colors`** — applies to production code, skips `isTest` + token files:
- Report string literals matching `/^(rgb|rgba|hsl|hsla|oklch|oklab)\(/i` anywhere.
- Report `Property` whose key matches `/(^color$|Color$)/` with a string value in the named-color
  set `red|blue|green|white|black|gray|grey|orange|purple|pink|yellow|teal|cyan|magenta|silver|maroon|navy|olive|lime|aqua|fuchsia` (case-insensitive).
- Report non-type import of a specifier named `palette` from a token-file source outside `isUiKit`.
- Message: "SKYFE026: raw color (`{{value}}`) — color is a semantic role (`color.*` in
  design/tokens.ts); raw values live only in the token file. (Hex is SKYFE012's half of this pair.)"

Rule keys ↔ codes are FINAL (doctor.mjs mapping above); pilots receive them via mirror rebase.

## Plan — for the executing agent
1. Read `index.cjs` in full (predicates, SKYFE012's shape, message voice) and `index.test.cjs`'s harness.
2. Write the test cases below into `index.test.cjs` (red).
3. Implement the three rules per the contracts; rationale comment above each in the house voice.
4. Wire doctor.mjs mapping + eslint.config.mjs warn-tier registrations + README rows; bump versions.
5. Run the gate; then run `npx eslint` over the sample tree and confirm ZERO hits from the new rules
   (current sample must be clean at warn — if a hit appears, the rule is too broad: narrow it, do not
   touch the sample in this stage).

## Tests first (TDD)
- [ ] `SKYFE024 flags a host element in a view` / `flags style and className attrs` —
- [ ] `SKYFE024 ignores @/ui components, <Resource>, and non-view files` —
- [ ] `SKYFE025 flags padding: 13 in a view style object and StyleSheet.create` —
- [ ] `SKYFE025 flags className="p-[13px]"` / `allows 0` / `ignores ui/ and tokens.ts and tests` —
- [ ] `SKYFE025 ignores non-spacing numerics (width, zIndex, flex)` —
- [ ] `SKYFE026 flags rgb()/hsl()/oklch() strings and named colors in color-ish keys` —
- [ ] `SKYFE026 flags value-import of palette outside ui/, allows type-only and inside ui/` —
- [ ] `SKYFE026 ignores the token file itself` —
- [ ] `doctor.mjs maps the three rule ids` —

## Gate
`npm --prefix frontend-sdk run check` is green AND the new rules produce zero findings on the
current sample tree (clean-at-warn check, step 5).

## Risks & rollback
- False positives on legit numerics → key-list is conservative by design; anything ambiguous
  (width/height/flex) is out of scope v1.
- Pilot mirrors lag → version bump 0.5.0 + framework-sync.mjs already fail stale mirrors; nothing
  extra to build here.

**Rollback:** revert the commit; rules unregister cleanly (config + mapping live in the same commit).

## As-Built
Shipped 2026-06-09, commit `644ae2c` — as planned (3 rules, 23 RuleTester cases, doctor map, warn
registration, README rows; generate.test.ts also runs the band over the scaffolded unit, closing the
emitter↔enforcer loop). Gate addendum: the eslint CLI can't reach `../examples` (flat-config base
path), so the clean-at-warn sweep ran via the Linter API — 29 files, 0 findings. The pauta dogfood
(0007) later exposed the band's biggest blind spot: Tailwind utility classes carry the raw palette
and the band never sees them (HIGH portback — PORTBACK-CHECKLIST.md, design-dogfood section).
