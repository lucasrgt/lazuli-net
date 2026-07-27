# Skies Framework — frontend

The frontend side of Skies. Where the .NET packages under `src/` give the backend its spine (`[Slice]`,
`Result<T>`, the Roslyn analyzers), this gives the React Native + web frontend an equally tight spine — **as
idiomatic React/TS primitives the app composes, not a DSL** (the "poisoned frontend": real React, enriched by
convention + tooling, never a second language). It is multi-target by construction: the same code serves web
(react-native-web) and native (iOS/Android) via Expo; only genuinely divergent bits (auth persistence, maps,
OAuth) are platform seams (`*.web.ts` / `*.native.ts`).

## Layout

```
frontend/
  package.json        # npm workspace root — `npm run check` = typecheck + test (the gate CI runs)
  tsconfig.base.json  # strict TS config every package/sample extends
  vitest.config.ts    # jsdom + the @/… aliases that let the sample run wired (not mocked)
  packages/
    skies-react/     # skies-react — the spine: AsyncState, Resource (+ guards, session as they graduate)
    eslint-plugin/    # eslint-plugin-skies — the SKYFE harness (rules + RuleTester self-tests)
  tools/              # generators + cross-file doctors used by skies doctor/skies gate
../examples/sample-app/frontend/
  core/               # canonical shared ViewModel/View/Assay feature units
  web/                # real web surface + Playwright journeys
  mobile/             # native surface convention
```

The framework-development gate (`npm run check`) runs strict typecheck, the plugin self-tests, unit/integration
tests, and the Assay partition. In consuming apps, `skies gate` additionally promotes the mandatory release-evidence
SKYFE rules to errors, verifies the AVP/E2E inventory, and executes the Git-derived proof closure.
Project-scoped architecture and design rules retain the file scopes and severities declared by the app rather than
being sprayed over every source file. The sample's tests mount data doors against the real generated-client shape
— **wired, not mocked**.

Apps (e.g. the Hostpoint dogfood) consume `skies-react` + the eslint plugin as packages; the `skies` .NET CLI
scaffolds them in and `skies doctor` shells out to `npm run lint` for the frontend slice (Roslyn in-proc for the
backend slice — two native engines, one front door).

## The spine — `skies-react`

The read-side analogue of `Result<T>`. A screen's **ViewModel** (the data door) exposes its resource as an
`AsyncState<T>` discriminated union; the **View** renders it through `<Resource>`, so loading / error / empty are
handled **by construction** (exhaustive switch), the way an exhaustive `Result` match forces the sad path.

```ts
type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; message: string; retry?: () => void }
  | { status: "empty" }
  | { status: "ready"; data: T };
```

`toAsyncState(query, { errorMessage, isEmpty? })` projects a react-query result into the union — **wire over
react-query, not a replacement** (react-query still owns fetch/cache/retry). `<Resource>` is design-system-
agnostic; the app injects its loading/error/empty visuals via slots.

## The canonical unit (the frontend `[Slice]`)

A feature is five co-located files plus its surface-owned E2E flows, mapped to the backend:

| Backend `[Slice]` | Frontend unit |
|---|---|
| `Handle` (logic, the data door) | `<Feature>.viewModel.ts` — the only client importer; platform-agnostic; exposes `AsyncState` + commands |
| `Output` (typed result) | `AsyncState<T>` |
| route `Map` | `<Feature>.view.tsx` — render only; consumes the ViewModel via `<Resource>` |
| co-located `*.Tests.cs` | `<Feature>.test.tsx` — mounts the door against the real client (wired, not mocked) |
| `[AVP]` criteria | `<Feature>.assay.test.tsx` — executable semantic acceptance proofs for every `@verify` |
| — | `<feature>.i18n.ts` — per-feature copy, all locales |

Visible features also declare reciprocal `@e2e` links whose flow criteria cover the complete Assay set; the web
runner is Playwright and the native runner is Maestro.

## The harness (the frontend self-audit)

`eslint-plugin-skies` (the SKYFE rules) is the front-side parallel of the backend's Roslyn/`Skies.Framework.Doctor`
self-audit. It polices the unit: View renders only (SKYFE001), the ViewModel is the one data door (SKYFE002, with
`lib/session` + `lib/guards` as the sanctioned infra doors), the ViewModel is platform-agnostic (SKYFE009), every
ViewModel has a co-located test (SKYFE005), no mocks in production (SKYFE003). The plugin **self-proves** with
RuleTester (`npm test`) — a rule isn't done until a test pins that it fires on the violation and passes on the
allowed shape.

## Current enforcement

The shipped harness covers the MVVM/data door, complete async state, i18n, design tokens, mutation feedback,
routing/session safety, form-validation surfaces, typed navigation, executable AVP/Assay proofs, omitted-test
detection, and semantic E2E linkage. Cross-file doctors enforce generated-contract freshness, endpoint coverage,
journey parity, Playwright/Maestro runner integrity, backend observations, and full Assay-to-flow criteria coverage.
