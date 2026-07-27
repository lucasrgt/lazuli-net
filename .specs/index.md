# .specs — living map

The archive is the truth: when someone asks "how does X work / why is it like this", the answer is
the archived techspec + ADR — not memory.

## Active

(none — the Design SDK wave shipped 2026-06-09; see Archived)

## Archived

### The Design SDK wave (2026-06-09) — the deterministic design layer for agent-built UI

Strategy: closed vocabulary (tokens + kit API) > mechanical enforcement (SKYFE design band) >
copyable exemplars (canonical screens) > context loading (skill) > pilot harvest (pauta).
Determinism comes from removing decision space, not from adding instructions. All gates green;
maker approved the taxonomy and the pauta relift 2026-06-09.

| id   | slug                  | what it is now |
|------|-----------------------|----------------|
| 0001 | design-constitution   | `docs/DESIGN-CONVENTIONS.md` — taxonomy, closed kit API, band catalog, recipes. Superseded in-wave: `Text alert` (0005), `ColorRole scrim` (0007). |
| 0002 | token-contract        | `renderDesign()` + `design-scaffold.mjs`; canonical `tokens.ts` in the sample, drift-pinned to the template. |
| 0003 | ui-kit-primitives     | The closed-API web kit + RN mirror in the sample's `ui/`; `--kit web` scaffold (`tools/ui-kit-web.mjs`, embed generated from the exemplar). |
| 0004 | skyfe-design-band      | SKYFE024 `ui-door` · SKYFE025 `scale-only` · SKYFE026 `semantic-colors` — shipped, error-tier on the sample. Known blind spot: Tailwind utility classes (HIGH portback). |
| 0005 | canonical-screens     | The recipes: `deposit/` (form — mirrors the real Deposit slice) + `items/` (list). Band + web jsx-a11y promoted to error with them. |
| 0006 | design-skill          | `skies-design` — the pointer-only context loader (repo + template, byte-identical). |
| 0007 | pauta-design-dogfood  | Pauta wired (mirror 0.6.0, tokens, kit, app-owned Dialog replacing `window.confirm`, `billing-type-edit` exemplar). Harvest in `docs/PORTBACK-CHECKLIST.md` §design-dogfood. |

## Next wave (cut from this one, by decision)

- **SKYFE026 Tailwind leg** — the harvest's HIGH finding: flag palette-family utility classes
  (`bg-red-100`, `text-blue-600`) outside `ui/` once tokens exist. The band is currently blind to
  the most common web styling mechanism.
- **Pauta full relift** — "todas as telas": per-feature cells dispatched from
  `pauta-web/frontend/docs/design-relift-worklist.md` (3 generated patterns × ~36 entity cells),
  pattern proven on the exemplar.
- **Hostpoint adoption — conditional, aesthetics-frozen.** Hostpoint's UI is finished. It adopts
  the layer only as a pure token-aliasing refactor with ZERO visual delta (estética e estrutura
  inalteradas — maker's condition, verbatim). If zero-delta can't be guaranteed, it never adopts.

## Killed — named so it stays dead

- **Published `@skies/ui` npm component library** — a versioned component lib is the MUI/aerocoding
  vector: theming API surface, breaking releases, platform sprawl. The kit is scaffolded code the app owns.
- **Pilot-facing React Native kit** — hostpoint keeps NativeWind + its own components. The sample's
  mobile `ui/` mirror exists solely to keep the agnostic-View seam honest.
- **Dialog / Select / Tabs / Toast / DataTable in kit v1** — overlay a11y is a deep well; apps extend
  their own `ui/` per the constitution. Pauta's Dialog (0007) is pilot-evidence #1 for a kit-v2
  decision — a second pilot needing it graduates it into the scaffold.
- **Theme runtime / dark-mode switcher** — dark *values* ship (proves the semantic layer); the
  switching mechanism is the app's.
- **Full SKYFE harness adoption in pauta** — the design band is separable by construction; the MVVM/
  i18n/routing harness adoption is its own wave, not a rider on this one.
- **Icon set, Figma sync, visual-regression CI, TOML/JSON design spec, CSS-in-JS runtime** — capability,
  not convention + enforcement. The TOML spec is specifically the mini-language vector CLAUDE.md forbids.
