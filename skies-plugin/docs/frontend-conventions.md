# Skies — Frontend conventions

React Native (Expo) mobile + RN-web + Astro (public/SEO); admin OS in react-dom. Per-product
`core` (ViewModels + client + i18n + model, platform-agnostic) promoted to `shared/` only at
≥2 products. `shared/kernel` holds auth/client/spine/ports (no app↔os edge). `Skies.toml` is
the single source for workspace/turbo topology (doctor validates drift).

## MVVM triple (one screen = one feature folder)

- View (`*.view.tsx`): pure render, exactly one ViewModel, mock-free by construction.
- ViewModel (`*.viewModel.ts`): plain hook `use<Name>Model(params) → { state, ...commands }`,
  render-agnostic AND platform-agnostic (no react-native/expo imports — capabilities arrive as
  injected ports: storage, navigator, push, file picker, linking, maps).
- Test co-located: VM via `renderHook()` (Vitest jsdom), View through the Providers harness.
- Acceptance proof co-located: every ViewModel `@verify` criterion resolves only to its exact
  `<Feature>.assay.test.tsx`, which registers executable `defineVerification(...)` proof.
- i18n per feature: `<feat>.i18n.ts` exports per-locale objects; assembled in
  `src/i18n/resources.ts`; shared copy in the `common` namespace; Views read
  `useTranslation("<feat>")`.

## Data wiring

orval (stock, react-query target, wrapped not forked) generates `client.gen/`: one typed hook
per slice, named after the slice (backed by `.WithName(...)` = operationId). The mutator
(`skies-client.ts`) unwraps Result<T>, injects auth, maps errors. Audience filter keeps only
this frontend's endpoints (webhooks/internal/other audiences excluded). ViewModels compose
generated hooks directly — never wrap in custom repositories. Completeness gate is the
compiler: an invented endpoint doesn't exist as an export.

## Async states

ViewModels expose `loading`/`error`/`empty` explicitly (`toAsyncState`, `combineAsyncStates`
from the skies-react spine). Views route all three through `<Resource>` (with retry).

## Mutations & feedback

QueryClient carries defaults: mutationCache onSuccess invalidates active queries + posts a
success note through the `lib/feedback` seam; onError routes to feedback unconditionally.
`meta: { silent: true }` skips the note (sign-in, reorder); `meta: { expectedFailure: true }`
for modeled failures. No per-call refetch rituals. Every mutate call still surfaces failure
somewhere visible.

## Session

One door: token writes via `lib/session` seam, paired with `me`-cache reset. Rotation:
web = client seam's single-flight 401 refresh+replay; native = gated bootstrap (token exchanged
once at boot, navigation gated on `ready`). Never both. Guards read tri-state `SessionState`.
Required params via `requiredParam()`; back via `safeBack`; redirects declarative; URL-sourced
navigation through an allowlist.

## Forms

react-hook-form lives in the ViewModel; zod schema grounded in the contract (required +
documented patterns lifted from OpenAPI; closed enums via controlled pickers). Field anatomy:
`Field` wires label↔control; hint is replaced by error (`role="alert"`, danger color); mutation
errors get their own alert block above submit; submit Button carries `loading`. Big forms:
spine (VM + tab shell) + pure `panels/<X>Panel.view.tsx` binding the shared `control`.

## Design & a11y

Tokens only: no inline hex, spacing/typography from the scale, semantic colors over palettes.
A11y: jsx-a11y (web) / react-native-a11y (mobile), warn-first promoted to error on canonical
screens; the design layer holds the floor (label wiring, role="alert", aria-busy, focus ring,
44px+ targets).

## Visible E2E

Every ViewModel declares the E2E ids needed to prove its semantic `@verify` set, with distinct happy and sad
behavior as the minimum path floor. Executable surfaces bind those ids in `e2e/flows.json` with
`features: ["ExactFeatureBasename"]`, exact `{ id, evidence }` criteria with distinct evidence asserted by that
enabled case, and a terminal assertion. One semantic criterion belongs to one case; happy and sad never share it.
The flow target fixes the engine: `target:web` is Playwright and `target:native` is Maestro. There is no runner
field or Cypress/Detox alternative for an agent to choose.
The subject flows must cover the complete AVP/Assay criterion set. Every UI-consumed generated hook appears in
`backendSlices` on at least one flow owned by an
actual consumer feature; shared hooks are proved once. A web backend-bound case
declares `backendContract`, observes real page responses through
`skies-frontend-sdk/playwright-backend`, and asserts the exact `backendSlices`; global setup probes
`PW_API_URL` with the canonical helper. A spec containing request interception, HAR routing, MSW, mock/stub
helpers, or direct API calls cannot prove it. Mocked UI smoke coverage stays in a separate front-only spec.
`skies gate` runs the Assay and E2E inventories and fails missing, skipped, focused,
seed-pending, not-executed, or syntactically manufactured evidence.

## Comments

Default none. A comment earns its place saying what code can't: a non-obvious why, a gotcha,
an invariant. English only; user copy is i18n pt-BR.
