# eslint-plugin-skies

The frontend harness — the front-side parallel of the backend's Roslyn analyzers (`Skies.Framework.Doctor`). It polices the
MVVM seam of a Skies screen so React Native + web stays **wired, not mocked**. Doctor-removable: delete the
plugin and the app still builds; you only lose enforcement.

## Rules

| Rule | Code | Polices |
|---|---|---|
| `view-purity` | SKYFE001 | A `*.view.tsx` renders only — no generated client / axios / react-query import (contract **types** are fine). |
| `data-door` | SKYFE002 | The generated client has exactly two doors: a screen's `*.viewModel.ts`, and the auth/routing infra (`lib/session`, `lib/guards`). Re-exporting it (`export … from "client.gen"`) outside the doors is the laundering bypass — also flagged (type re-exports stay free). |
| `viewmodel-platform-agnostic` | SKYFE009 | A `*.viewModel.ts` imports no `react-native` / `expo` (value **or** type) — the core stays shareable web↔mobile and testable in jsdom. |
| `test-colocated` | SKYFE005 | Every `*.viewModel.ts` has a co-located `*.test.tsx` that `renderHook()`s it (unit tier — proof the data door mounts). |
| `view-integration-test` | SKYFE006 | Every `*.view.tsx` has a co-located test that `render()`s the View (integration tier — proof the screen composes + mounts). |
| `no-mock` | SKYFE003 | No mock/fixture/MSW import in production code (only under `*.test.*`). |
| `state-completeness` | SKYFE010 | A `*.view.tsx` routes loading/error/empty through `<Resource>` — no raw `isPending`/`isError`/… (the booleans are the ViewModel's). |
| `i18n-completeness` | SKYFE011 | Every locale catalog in a `*.i18n.ts` declares the same keys, compared as **flattened paths** (`empty.title`) so a key missing inside a nested group is caught too — a key in one locale but not its siblings is a silent untranslated string. |
| `design-tokens` | SKYFE012 | No inline hex color in production code — colors come from a token; only the `theme`/`tokens`/`palette` definition files may hold hex. |
| `mutation-error-handled` | SKYFE013 | A `*.viewModel.ts` mutation (`.mutate`/`.mutateAsync`) passes an `onError` — no silent failure (front-side of the backend's error_handling). An **empty** `onError: () => {}` is flagged too: that's the silent failure with paperwork. |
| `no-hardcoded-copy` | SKYFE014 | A `*.view.tsx` has no hardcoded user-facing text — JSX text children (`>text<`) **and** copy props (`placeholder`/`title`/`label`/…) go through i18n `t()`. High-signal (`{t()}`/non-copy attrs never flagged). |
| `no-router-replace-in-effect` | SKYFE015 | A redirect-on-state is a **declarative** `<Redirect>`/`<Navigate>` returned from render, never an imperative `router.replace`/`router.navigate`/`useNavigate()` call inside `useEffect` (a post-paint flash on TanStack; an infinite navigation/refetch loop on expo-router web). |
| `session-one-door` | SKYFE016 | The session token is written through **one seam** (`lib/session`); a `*.viewModel`/`*.view` importing the token setter (`setAccessToken`/…) directly — **or writing a token-ish key straight to storage** (`localStorage`/`AsyncStorage`/`SecureStore.setItem("…token…", …)`) — is the scattered write that forgets the cache reset, and bounces the just-authenticated user back to login. |
| `guard-tristate` | SKYFE017 | A route guard redirects on a **tri-state** `SessionState` (`loading \| authenticated \| anonymous`), never a raw `isAuthenticated` boolean (which reads "still loading" as "signed out"). The read-side twin of SKYFE010. |
| `route-param-guard` | SKYFE018 | A route reading a **required id param** (expo-router `useLocalSearchParams`) guards its absence — `if (!id) return <Redirect …/>` — so a param-less hit (bookmark / stale link) can't render a ghost screen on an empty id. |
| `safe-back` | SKYFE019 | No bare `router.back()`/`history.back()` — on web a deep-linked screen has no in-app history, so it's a dead button. Route Back through a guarded helper (`safeBack`/`useGoBack`) that falls back to a parent. |
| `no-hardcoded-base-url` | SKYFE020 | The API base URL comes from **configuration** (env `VITE_API_URL`/`EXPO_PUBLIC_API_URL`, a relative base, or an injected default), never a hardcoded host baked into `axios.create({ baseURL: "http://…" })` — a baked literal silently 404s when the backend runs on a different port. |
| `no-raw-html` | SKYFE021 | No `dangerouslySetInnerHTML` outside the **one audited seam** (`lib/html`) — JSX escapes by construction; raw HTML is the XSS door, and if the app renders rich HTML the sanitizer lives in that seam, reviewable. |
| `no-open-redirect` | SKYFE022 | Never navigate to a value that **arrived in the URL** (`router.replace(returnTo)` / `location.href = next` off `useLocalSearchParams`/`useSearch`) — the open-redirect phishing primitive. Map the param through an **allowlist** of known routes first. |
| `ui-door` | SKYFE024 | A `*.view.tsx` renders **no host element** and carries **no `style`/`className`** — everything visual comes from `@/ui` (the app-owned kit, token-typed props). The `data-door` pattern applied to paint; a missing primitive is extended in `ui/`, never inlined. |
| `scale-only` | SKYFE025 | No off-scale spacing/typography literal (`padding: 13`, `fontSize: "13px"`, Tailwind `p-[13px]`) outside `ui/`, the token files, and tests — rhythm comes from the `space`/`text` scales (DESIGN-CONVENTIONS.md). |
| `semantic-colors` | SKYFE026 | No `rgb()/hsl()/oklch()` literal, no CSS named color in a color-ish style key, no value-import of the raw `palette` outside `ui/`, and no Tailwind palette-family utility (`bg-red-500`, `text-blue-600`) in a `className` outside `ui/` — color is a semantic role (`color.*`/theme). Completes `design-tokens` (SKYFE012, the hex half). |
| `query-client-defaults` | SKYFE027 | Production QueryClients install the shared success invalidation/feedback and failure feedback defaults. |
| `no-manual-refetch-ritual` | SKYFE028 | A mutation success handler does not duplicate the global invalidation default with a refetch-only ritual. |
| `refresh-one-door` | SKYFE029 | Token refresh is consumed only by the client/session rotation seams, never by a second feature path. |
| `no-navigation-cast` | SKYFE030 | Navigation targets cannot escape typed routes through `as never`/`as any`/`as unknown`. |
| `submit-invalid-path` | SKYFE031 | Form submit wiring carries an invalid callback, so pre-mutation validation failure has a visible path. |
| `controller-field-state` | SKYFE032 | A controlled field reads and surfaces its `fieldState` error. |
| `verify-has-avp-proof` | SKYFE033 | Every ViewModel `@verify` has an exact co-located executable `@avp`, and every `@avp` belongs to a declared `@verify`, so proofs cannot disappear from E2E coverage. |
| `no-disabled-tests` | SKYFE034 | Test/spec files contain no skipped, conditional, todo, or focused declarations. |
| `feature-has-e2e-flow` | SKYFE035 | Every ViewModel declares distinct happy and sad `@e2e <flow-id>` obligations; the workspace doctor resolves both to executable surface journeys. |

### Routing rules — both routers, one shape

SKYFE015–019 are the **routing harness**: the front-side parallel of the backend's slice rules, born from the two app pilots (Pauta on TanStack Router, Hostpoint on expo-router) converging on the same navigation bugs — a freshly-registered user bounced to login, ghost screens on missing params, dead Back buttons, effect-driven redirect loops. They police a **shape** (declarative redirect, tri-state session, guarded param, guarded back), so they recognize each router's idiom (`<Redirect>`/`router.replace`/`useLocalSearchParams` ↔ `<Navigate>`/`useNavigate()`/`Route.useParams`) without depending on either runtime — "ship the standard, not the adapter". The tri-state `SessionState` and the `safeBack` helper they steer toward live in the spine (`skies-react`).

## Self-proving

`npm test` runs `index.test.cjs` — RuleTester cases that pin every rule on **both** edges: it must FIRE on the
violation it polices and PASS on the shapes it allows. A rule isn't done until both are pinned (the discipline the
framework applies to its own backend rules). CI runs this beside `dotnet build` and the spine's vitest suite.

## Consuming it in an app

An app registers the plugin in its flat ESLint config and turns the rules on for its feature tree — see the
`frontend-sdk/eslint.config.mjs` in this repo, which lints the canonical `sample/`. Until this package is published to
npm, a consuming app (e.g. the Hostpoint dogfood) installs it from this repo; once published it is a normal devDep.
