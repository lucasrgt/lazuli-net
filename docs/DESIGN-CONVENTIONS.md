# Skies (.NET) — Design Conventions & the Design SDK

The design layer is the third third of the framework. The backend constitution makes architecture
decisions default-good ([CONVENTIONS.md](CONVENTIONS.md)); the frontend constitution makes wiring
decisions default-good ([FRONTEND-CONVENTIONS.md](FRONTEND-CONVENTIONS.md)); this file makes
**visual decisions default-good**. It exists to kill the failure the pilots lived: **agent-built UI
is non-deterministic.** Every unconstrained visual decision — a px value, a hex, a layout invented
per-screen — is a decision an agent makes differently each time, and the sum reads as inconsistent:
arbitrary spacing, forked palettes, unaligned typography, ad-hoc forms.

Determinism is not achieved by instructing harder. It is achieved by **removing decision space**,
in five layers of decreasing strength:

1. **Closed vocabulary** — kit props are unions of token names; a wrong value is *inexpressible*.
   What cannot be typed cannot be wrong. (The strongest layer; everything else guards it.)
2. **Mechanical enforcement** — the design band (`SKYFE024–026`, beside `SKYFE012`) trips every
   named escape hatch: raw elements, off-scale values, raw color.
3. **Executable contract** — [Assay Design](https://github.com/lucasrgt/assay-design) reads the
   versioned `.design/` vocabulary and returns an AVP verdict over normalized DOM/Figma evidence.
4. **Copyable exemplars** — canonical screens (the recipes). An agent instantiates the nearest
   recipe; it never composes a screen from a blank file.
5. **Loaded context** — the `skies-design` skill puts 1–4 in front of the agent at build time and
   closes with a visual self-review (lint can verify consistency; only eyes verify beauty).

Ground every design convention here, never memory. The decision trail lives in the Design SDK wave
(`.specs/`, stages 0001–0007).

`.design/contract.toml` plus DTCG `*.tokens.json` is the machine-readable authority. Figma remains
the intent/editor surface and Storybook remains the executable component surface; both project
evidence into the same contract and AVP verdict instead of owning competing rules. `data-ui` is the
stable evidence seam in Skies components. Run `npm run design:doctor` from `frontend-sdk/` to validate
the contract; agents run `assay-design recall` before editing UI (`skies-design` skill). Population
drift is audited with `assay-design audit` / `fleet`; systematic escapes are promoted with
`assay-design promote`. The normal frontend check also runs the conformant sample-kit test.

Every `skies new` project carries this contract, its DTCG tokens, and the package-pinned Assay Design CLI at
the repository root. `npm run check`, lefthook, generated CI, and `skies doctor` all validate it from birth;
once a product surface exists, its rendered Evidence IR upgrades that structural doctor into an AVP
conformance proof without changing the contract format.

The reusable kit follows executable Atomic Design: atoms (`Text`, `Button`, `Input`) contain no kit
components; molecules (`Stack`, `Field`, `Card`) declare their allowed `parts`; `Screen` is the
template; and a rendered product page is a `surface`, not a fifth reusable tier. Assay Design records
the nearest `data-ui` parent and rejects undeclared composition, upward tier nesting, cycles, missing
templates, and unknown parts through the normal AVP composition criterion.

---

## The two laws — restated for design

1. **Stranger-maintainable.** The kit is plain React / React Native components **in the app's own
   repo**, styled by direct lookup into a plain tokens file. A dev who has never heard of Skies
   opens `ui/Stack.tsx` and reads a flexbox container. No theme provider to learn, no styled-system
   DSL, no runtime.
2. **Doctor-removable.** Remove the design band and the app still builds and renders **pixel-
   identical** — tokens are data, the kit is the app's code. You lose enforcement, never function.

**Vocabulary, not mechanism — the posture in one line.** Skies prescribes the token **names** and
the kit **shape**; it never prescribes the styling **library**. CSS vars, Tailwind/NativeWind,
StyleSheet, Unistyles — the mechanism is the app's, mapped *from* `tokens.ts` by hand, once. Token
**values** are the app's too: that is the entire theming and white-label story. What is fixed is
what things are *called* and what shape the door has — because names and shapes are what agents
(and rules) can hold onto.

---

## The token taxonomy — names are the convention, values are yours

The single source of truth is one plain TS file the app owns — canonically
`core/src/design/tokens.ts` (tokens are platform-neutral data; they live in the shared core, the
hostpoint precedent). Scaffolded by `skies`'s design scaffold; edited freely **in values**, never
in names. Hex belongs ONLY in this file (`SKYFE012` exempts it by filename; `SKYFE026` completes the
pair for every other raw-color spelling).

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

Why these scales, and why closed:

- **Spacing is a 4px grid** (`0 4 8 12 16 24 32`). Seven steps cover real screens; an eighth ad-hoc
  value is how rhythm dies. There is no `space.custom` — a layout that "needs 13px" needs a design
  decision, not a thirteenth pixel.
- **Type is a 1.25 modular scale from 16** — `caption 12/16 · label 14/20 · body 16/24 ·
  heading 20/28 · title 25/32 · display 31/40` (size/line-height; weights 400–700 fixed per role).
  A `TextRole` carries size + line-height + weight **together**: typography is one decision, not three.
- **Color is semantic, two-sided.** Roles name *function* (`surface`, `textMuted`, `danger`), never
  appearance — that is what makes `themes.dark` a value swap instead of a rewrite. Every filled role
  has its on-pair (`primary`/`onPrimary`, `danger`/`onDanger`): contrast is a token-level guarantee,
  not a per-screen hope. If an app keeps a raw palette (brand ramps), it stays **private to the
  tokens file** — components touch `color.*` roles only.
- **Shadows are elevation levels** (`raised` for cards, `overlay` for dialogs), **motion is four
  durations**. Both deliberately tiny: elevation and timing are system decisions, not per-component
  creativity.

---

## The kit — a closed API is the convention

The kit is scaffolded **into the app** (`ui/` — code you own), never published as a package. Skies
ships the *standard* a kit follows plus a conformant starting kit; it does not ship a component
library you version against (that is the MUI/aerocoding vector, rejected by construction). The
locked v1 surface:

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

- **No `className`. No `style`. No `as`. No render props.** One escape hatch reopens 100% of the
  decision space, and the ui-door rule (`SKYFE024`) would then police a fiction. The door is closed.
- **A missing primitive is extended in YOUR `ui/`** — following this constitution (tokens only, the
  five states, the a11y wiring) — never worked around with inline paint. The kit is the app's code;
  growing it is normal. (Overlay primitives — Dialog, Select, Toast — are deliberately not in v1:
  apps add them this way, and pilot evidence decides what graduates into the scaffold.)
- **`Button.label` is a string, not children.** A button is a labeled action, period — composite
  button content is where visual anarchy (and broken accessible names) starts.
- **Styling is inline token lookup** in the scaffolded kit (`style={{ padding: space[padding] }}`):
  zero dependencies, identical in jsdom, one greppable hop from token to pixel. An app may refactor
  its kit onto its own mechanism (NativeWind classes, CSS modules) — the **API contract** is the
  convention, the implementation is the app's.

### The five interactive states — the kit's job, never the consumer's

Every interactive primitive implements all five internally: **rest · hover · focus-visible ·
active · disabled**. The focus treatment is a 2px `color.focusRing` ring, and it is **never
suppressed** — `outline: none` without a replacement is a banned move, everywhere, always.
Disabled renders muted AND blocks the handler. `loading` is disabled + announced (`aria-busy`).
A consumer cannot forget a state because the consumer never implements states.

---

## Form anatomy — one shape for every field

```
Field
  label          → always present, wired to the control (htmlFor / nativeID = fieldId)
  control        → Input/the control, receives invalid + aria-describedby when error is present
  hint | error   → hint when clean; error REPLACES hint, role="alert", color.danger
```

- Field-level validation errors render **inside the Field** — never as a toast, never only at the top.
- The **mutation error** (the command failed) is a separate `role="alert"` block rendered above the
  submit (`Text role="label" tone="danger" alert`) — the visible half of the `SKYFE013` discipline
  (every mutation surfaces its error).
- The submit `Button` carries `loading` while the mutation is pending. Double-submit is a kit
  guarantee (loading blocks), not a per-form fix.
- Forms follow the blessed shape ([FRONTEND-CONVENTIONS.md §Forms](FRONTEND-CONVENTIONS.md)):
  react-hook-form + zod in the ViewModel; the View binds `Field`s. The form **recipe** is the
  canonical instance — copy it.

---

## Text hierarchy — one title, descending order

- **One `display`-or-`title` per screen.** It is the screen's name; two titles is two screens.
- Hierarchy descends without skipping: `title → heading → body`; `label` for form labels and small
  UI captions-with-function; `caption` for metadata. Emphasis inside running text is `tone`/weight,
  never a bigger role.
- `body` is the default — if most of a screen is not `body`, the hierarchy is upside down.

## Layout & spacing — rhythm comes from the scale

- Spacing comes **only** from `space`, reached through props (`Stack gap`, `padding` on
  Screen/Card/Stack). **Never margins on children** — vertical rhythm belongs to the container
  (`Stack gap`), horizontal structure to `direction`/`align`. A child that sets its own margin is
  fighting the system.
- Touch targets ≥ 44px — a kit guarantee (`Button`/`Input` minHeight), restated here because
  custom `ui/` additions must hold it too.
- On web, `Screen` owns readable width (centered content column); screens never hand-roll page
  margins.

## Color discipline — roles, never values

- Components reference `color.<role>` only. Raw values — hex (`SKYFE012`), `rgb()/hsl()/oklch()`,
  CSS named colors, and Tailwind palette-family utilities (`bg-red-500`, `text-blue-600`) (`SKYFE026`) —
  live exclusively in the tokens file / the theme; a screen uses semantic, theme-mapped utilities
  (`bg-primary`, `text-danger`) instead.
- Anything rendered **on** a filled role uses its on-pair: `onPrimary` on `primary`, `onDanger` on
  `danger`. Pairs are chosen at token-definition time to hold WCAG AA (≥ 4.5:1 for text); that is
  where contrast is decided, once.
- Status communication: `danger`/`success`/`warning` with their `*Surface` tints for banners and
  badges. Color is never the only signal (icon or text accompanies it).
- **Color that is DATA is not a theme decision.** A value carried by content — a kanban column's
  user-picked color, a service category's catalog color — is data, not vocabulary, and it does not
  belong in the tokens file (it varies per row, not per theme). The shape: a **kit component takes
  the color as a typed prop** (`<ServiceChip color={service.color}>`), and the raw lookup/inline
  style lives inside `ui/` — the band's exemption boundary — never in a screen. The screen passes
  data; the kit decides how data becomes paint (including the contrast treatment). Two-pilot
  evidence: hostpoint's service chips and pauta's kanban step colors both hit this case
  independently.

## Responsiveness — three breakpoints, compact-first

- `breakpoints`: `compact 0 · regular 768 · wide 1200`. Layout is designed compact-first and may
  shift **only at named breakpoints** — no per-screen magic widths.
- What shifts: columns, navigation chrome, content width. What never shifts: token values, type
  roles, spacing steps (the vocabulary is breakpoint-invariant; only arrangement responds).

## Accessibility — by construction first, by lint second

- The kit carries the floor: label↔control wiring (`Field`), `role="alert"` on errors, `aria-busy`
  on loading, the focus ring, touch targets. A screen composed of kit primitives is accessible by
  default — that is the point of closing the API.
- The lint half stays as constituted in [FRONTEND-CONVENTIONS.md](FRONTEND-CONVENTIONS.md):
  `eslint-plugin-jsx-a11y` (web) / `eslint-plugin-react-native-a11y` (RN), wired alongside, never
  reinvented. Warn-first — and **web promotes to error when the canonical screens land** (the
  recipes prove green is reachable; the bar rises exactly then, not before).

## Theming — values swap, structure never

- A theme is a complete `Record<ColorRole, string>`. `themes.dark` ships in the default scaffold to
  prove the semantic layer (roles named by function survive inversion); white-label is another
  value set on the same names.
- **No component ever branches on the theme.** If a component needs `if (dark)`, a role is missing —
  fix the taxonomy, not the component. The switching mechanism (class, media query, context) is the
  app's; the framework defines only what a theme *is*.

---

## The design band — rule catalog

The enforcement half. Same grain as the `SKYFE*` catalog in
[FRONTEND-CONVENTIONS.md](FRONTEND-CONVENTIONS.md) (these rows are mirrored there); same posture as
every band before it: **warn-first, promoted to error when the canonical code is clean**. What the
kit guarantees by construction (states, anatomy) is deliberately NOT linted — heuristic lint on
undecidable properties teaches agents to suppress, the worst harness outcome.

| Rule | Enforces | Status | Origin |
|------|----------|--------|--------|
| `SKYFE012` | **Design tokens (hex half)** — no inline hex outside token/theme/palette files | **shipped** | one palette; theming survives |
| `SKYFE024` | **UI door** — a `*.view.tsx` renders no host element (no lowercase JSX) and carries no `style`/`className` attribute; everything visual comes from `@/ui`. A missing primitive is extended in the app's `ui/`, never inlined. The `SKYFE002` one-door pattern applied to paint | planned (design band) | the sample's pre-kit `ui.tsx` leaked `className` — one passthrough reopened every decision |
| `SKYFE025` | **Scale only** — outside `ui/`, token files, and tests: no numeric literal in spacing/typography style keys (`padding*`, `margin*`, `gap`, `rowGap`, `columnGap`, `borderRadius`, `fontSize`, `lineHeight`; `0` allowed), and no Tailwind arbitrary value on a **spacing/typography utility** (`p-[13px]`, `text-[14px]`, `gap-[7px]`). Layout dimensions (`max-w-[560px]`, `h-[80vh]`) are deliberately free — the style half allows `width: 320`, and the class spelling of the same decision must agree (asymmetry caught by the hostpoint-os dogfood) | **shipped** | off-scale values are how rhythm dies one screen at a time |
| `SKYFE026` | **Semantic colors** — outside token files: no `rgb()/rgba()/hsl()/hsla()/oklch()` literals, no CSS named colors in color-ish style keys, no value-import of a raw palette export outside `ui/`, and no Tailwind palette-family utility (`bg-red-500`, `hover:border-rose-400/50`) in a `className` outside `ui/`. Completes `SKYFE012` (hex) — together: color is a role, or it does not ship | planned (design band) | a forked palette defeats theming silently; hex and `bg-red-500` were just other spellings of the leak |

Exemption boundaries, locked: the app's `ui/` folder (the kit implements the vocabulary, so it
touches primitives and values), the token files (`SKYFE012`'s filename pattern:
`theme|tokens|palette|colors`), and tests.

---

## Recipes — instantiate, do not invent

Recipes are **real, compiled, tested screens** in the sample app — never doc snippets (snippets
don't lint, so they rot). A new screen starts as a copy of the nearest archetype; composition is
the recipe's job, binding is yours. (Agents: the `skies-design` skill routes you here —
instantiate, do not invent.)

| Archetype | Canonical unit | Use for |
|-----------|---------------|---------|
| **list** | `examples/sample-app/frontend/core/src/items/` | a server collection: `<Resource>` with ready/empty/error/loading rendered through kit states (`EmptyState`, `ErrorState` + retry), title + `Card` rows |
| **form** | `examples/sample-app/frontend/core/src/deposit/` | a create/edit command (mirrors the backend's real `Deposit` slice): Field anatomy, zod validation surfaced per-field, the `role="alert"` command error, submit loading states, declarative success |

Archetypes earn recipes through pilot demand (two independent requests for the same archetype =
spec the recipe) — dashboards, wizards, settings screens arrive that way, never speculatively.

---

## Scope — and non-goals

**In:** the token taxonomy, the closed kit API + scaffold, the design band (`SKYFE024–026`), the
recipes, the `skies-design` skill.

**Out (non-goals), by decision:**
- **No published `skies-ui` component library.** A versioned UI lib is theming-API surface +
  breaking releases + platform sprawl — the MUI/aerocoding vector. Scaffolded code-you-own, always.
- **No styling-mechanism prescription.** Tailwind/NativeWind/StyleSheet/CSS vars stay the app's;
  the app maps them *from* `tokens.ts` once, by hand.
- **No overlay primitives in kit v1** (Dialog/Select/Tabs/Toast/DataTable) — apps extend their own
  `ui/` per this constitution; pilot evidence decides what graduates.
- **No theme runtime.** Dark mode is a value set, not a switcher; the mechanism is the app's.
- **No Skies-owned icon set, bidirectional Figma authority, or visual-regression engine.** The
  standalone Assay Design contract is a validation vocabulary, not a UI generator or behavioral
  DSL; Git stays canonical while Figma and Storybook only project evidence into AVP.

When a proposal smells like *capability* instead of *convention + enforcement*, it is a scope
violation. Reject in line.
