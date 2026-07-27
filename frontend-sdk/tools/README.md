# tools — frontend generators + doctors

Beyond the typed client (orval generates that from the backend contracts), these emit the *structure* a feature
needs — the frontend parallel of the backend scaffold — and check the parts a per-file lint rule can't see. Pure
functions (no I/O, unit-tested); the `*.mjs` CLIs wrap them with file writes / reports. The `skies` .NET CLI
front-door shells out to these (the way `skies doctor` shells out to `npm run lint`) — two engines, one front door.

## The test tiers (how each is enforced)

| Tier | Enforced by | Where |
|---|---|---|
| Unit | `SKYFE005` (every ViewModel has a co-located `renderHook` test) | eslint, per-file |
| Integration | `SKYFE006` (every View has a co-located `render()` test) | eslint, per-file |
| AVP | `SKYFE033` (every ViewModel declares its `@verify` set; the exact co-located `*.assay.test.tsx` registers a matching `@avp` + `defineVerification` for every id) | eslint + `npm run test:avp` |
| **E2E** | `SKYFE035` + **`feature-e2e-coverage.mjs`** (every ViewModel links flows whose `criteria` cover its AVP/Assay set; every UI-consumed backend slice is named) + **`e2e-doctor.mjs`** (every flow has an enabled case, terminal assertion, and runner) | eslint + workspace gate + surface gate |

At the release boundary, `skies gate` invokes `skyfe-eslint-gate`. That wrapper reads the installed
`eslint-plugin-skies` and forces the release-evidence rules (data door, no production mocks,
unit/integration/AVP/E2E obligations, and no disabled tests) as errors with `--no-inline-config`.
A consumer config can add stricter architecture or design policy, but cannot omit proof required for done.

E2E remains flow-level, but coverage is now enforced in both directions. Every ViewModel declares every one of
its `@e2e <flow-id>` obligations; `skyfe-feature-e2e` resolves them against the union of the product surfaces and
also fails when a flow claims that ViewModel through `features` without the reciprocal `@e2e`. Every
UI-consumed slice hook must appear in at least one subject flow belonging to one of its actual consumer features;
shared queries are proved once, not once per importer. Session/guard infrastructure retains happy+sad evidence.
An unavoidable literal raw call in infrastructure declares its identity beside the call as
`@backendSlice Refresh POST /account/refresh`; missing, stale, or unknown declarations are gaps, and the declared
slice also owes happy+sad real-browser evidence. ViewModels continue to use generated hooks exclusively.
Every flow owns exactly one ViewModel and names `{ id, evidence }` `criteria` from that ViewModel's `@verify` set.
Its exact case must visibly assert each distinct evidence marker; one criterion belongs to one case and one
assertion cannot pay several criteria. The union must cover the complete set; unknown, missing, reused, or
criterion-free claims fail. Every ViewModel also needs subject-bound `happy` and `sad` flows as the minimum path
floor, not as a fixed definition of completeness.
A web flow naming backend slices declares its checked-in OpenAPI file as
`backendContract`, then its exact case collects page responses with `observeBackend()` and closes the ledger with
`expectBackendSlices()` or the bounded `waitForBackendSlices()` when parallel requests can settle after the terminal
UI. The expected names must exactly match `backendSlices`; happy flows require 2xx evidence
and sad flows require 4xx/5xx evidence. A Playwright global setup calls `probeBackend()` or
`createBackendGlobalSetup()` against `PW_API_URL`; only a successful HTTP response sets `PW_API_READY=1`. A
local namesake cannot impersonate the branded observation, another case cannot lend it, and a backend-bound spec
cannot install request interception, import mock/stub support, or call the API directly outside the rendered page.
The check follows relative local imports recursively, so moving that bypass into a support helper is still red.
Every web spec imports `test` from `skies-frontend-sdk/playwright`. Its automatic fixture records
`pageerror` events plus application warning/error console output and fails the case at teardown; handled 4xx/5xx
fetch/XHR responses remain HTTP evidence, while failed assets and transport errors stay red. A visible terminal
cannot manufacture green evidence while the browser reports a broken or deprecated execution path.
The conventional `src/storybook/` development surface is outside this production inventory; arbitrary source
directories remain scanned, so this is a fixed convention rather than a configurable coverage exclusion.
`checkE2e(root)` then proves every declared flow has an enabled spec/case, terminal assertion, and its canonical
target-derived runner: Playwright config for `target:web`, the complete `maestro test e2e` script for
`target:native`. Empty convention directories are not runner evidence. There is no configurable runner
field; Cypress and Detox configurations fail as noncanonical rather than creating alternate release paths.
The CLI also compares those web `spec/case` obligations with `playwright test --list`, so runner configuration
cannot collect only a convenient subset. `skies gate` separately requires `test:e2e` to contain the unfiltered full
runner; native specs use Maestro YAML and `maestro test e2e`. Setup belongs in runner configuration/global setup.
A missing/empty manifest is red. See the
Hostpoint dogfood's `scripts/skyfe-e2e-doctor.mjs` (a thin CLI over `checkE2e`) + `playwright.config.ts`.

Minimal real-backend setup:

```ts
// e2e/global-setup.ts
import { createBackendGlobalSetup } from "skies-frontend-sdk/playwright-backend";
export default createBackendGlobalSetup({ path: "/health" });

// e2e/account.spec.ts
import { observeBackend, waitForBackendSlices } from "skies-frontend-sdk/playwright-backend";
test("signs in", async ({ page }) => {
  const backend = await observeBackend(page, "contract/Api.json");
  // Drive the visible UI; configure the app's API base URL to PW_API_URL without interception or direct fetch.
  await waitForBackendSlices(backend, ["Login"], { status: "success" });
});
```

## The fullstack loop (journey parity)

`journey-parity.mjs` (`checkJourneyParity`) closes the loop at the **journey grain**: the backend declares write
journeys through co-located `[Journey(typeof(Slice), Happy|Sad)]` tests, while frontend `backendSlices` derives
which writes actually have a UI surface. The doctor requires both backend paths for every UI-bound write and
reports unreferenced writes as valid backend-only behavior. There is no optional file-name link for an agent to
omit or redirect. The *endpoint* grain is already closed by generated types, endpoint coverage, and the observed
browser ledger. The backend argument is the API source root; a directory with no `[Slice]` declarations fails
closed, so pointing at a tests/journeys leaf cannot manufacture a zero-write green report. A genuinely read-only
API remains valid because its GET slices still prove that the inventory root is real.

When those endpoints are shared by multiple frontend surfaces, endpoint coverage also consumes the union of their
source roots:

```
skyfe-endpoint-coverage app-core/src/client.gen/api.ts app-core/src operator/src partner/src
```

A generated hook or imperative operation counts only when a legal data door value-imports that exact symbol from
`client.gen`. This covers on-demand downloads/lookups without letting a similarly named local callback manufacture
coverage. A raw infrastructure call may instead declare `@backendSlice Slice METHOD /path`; endpoint coverage
recognizes it only as one leg of the complete gate, while feature-E2E independently rejects a declaration without
the matching call and happy/sad browser journeys. Browser assets whose URL is carried by another response use
`EndpointKind.Asset` and never enter this data-operation inventory.

When one backend serves multiple executable surfaces, pass every independently-gated manifest; parity is computed
over their union without pretending operator or partner journeys belong to the consumer app:

```
skyfe-journey-parity ../api app/e2e/flows.json operator/e2e/flows.json partner/e2e/flows.json
```

## One report — the unified doctor

`doctor.mjs` (`aggregateReport`) is the single front-door that captures the **whole crew** in one pass: `eslint
--format json` (every rule — the SKYFE architecture rules, the community kit, expo's set — bucketed) plus the
fullstack script-doctors above. The core is pure (feed it the eslint results, each
rule's configured level, and the loop summaries); a consumer CLI does the I/O. It surfaces the **SKYFE roster
including clean (0-hit) rules** so a `warn`→`error` promotion is an evidence-backed move — you see, in one place,
which rules gate, which are a revealed backlog, and which are already clean. See the Hostpoint dogfood's
`scripts/skyfe-doctor.mjs` (`npm run doctor` / `doctor:json`) — a thin CLI over this core.

## Scaffold a feature unit

```
npm run scaffold -- <plural-name> --verify <happy-id,sad-id,...> [targetDir]
# e.g. npm run scaffold -- bookings --verify lists-authoritative-bookings,reveals-list-failure sample/bookings
```

Emits the five co-located files of the canonical unit — `<Feature>.viewModel.ts`, `<Feature>.view.tsx`,
`<Feature>.test.tsx`, `<Feature>.assay.test.tsx`, `<feature>.i18n.ts` — with names derived from the feature name.
Every explicitly chosen Assay criterion is red by design until its concrete product assertion is implemented;
there is no generic default, and the scaffold requires distinct happy/sad outcome criteria. The other four files
are the blessed `sample/items` shape with substitutions, so their structure **passes every SKYFE rule and typechecks by construction**
(`generate.test.ts` writes a unit to disk and lints it with the real rules to prove the emitter and the harness
agree). Its generated `@e2e <feature>-happy` is deliberately unresolved until the owning surface adds the real
flow, spec, and terminal proof. Then refine the entity fields, wire the slice in `@/client.gen`, and fill the copy.

## Assemble the i18n resource tree

```
npm run assemble-i18n -- <featuresDir> <outFile>
# e.g.  npm run assemble-i18n -- features src/i18n/resources.generated.ts
```

Discovers every `*.i18n.ts`, derives each namespace from the filename, and emits a generated module that imports the
locale catalogs and composes `resources` (locale → namespace) — what an app otherwise wires by hand. The output
typechecks, so a renamed/removed catalog fails the build; pair it with SKYFE011 (key parity *within* each catalog) —
the `skies/i18n-completeness` rule in-scope, or `i18n-parity.mjs` below when the catalogs are cross-package.

## i18n parity — cross-package catalogs (SKYFE011, the other half)

```
node tools/i18n-parity.mjs <catalogsDir> [...moreDirs]
# e.g.  node tools/i18n-parity.mjs ../examples/sample-app/frontend/core/src
```

SKYFE011 has two mechanisms for two layouts. When the catalogs live *inside* the linted source, the
`skies/i18n-completeness` eslint rule pins parity per file at lint time — done. But in a **core-split** layout the
catalogs sit in a SEPARATE package, outside the app's eslint scope, so the rule never sees them. `i18n-parity.mjs`
reads them directly and enforces the same invariant (every locale object in a catalog declares the same keys; a key
in one but not its siblings is a silent untranslated string), locale-agnostic like the rule. **Use the rule when
catalogs are in lint scope, the tool when they're cross-package** — same convention, the mechanism follows the
layout. (The Hostpoint dogfood runs the tool: its catalogs live in `@hostpoint/app-core`, out of the app's scope.)

## Error-code coverage — every code has copy

```
node tools/error-code-coverage.mjs <catalog.i18n.ts> <errorBody.ts>
# e.g.  node tools/error-code-coverage.mjs ../app-core/src/i18n/api-errors.i18n.ts ../app-core/src/client.gen/model/errorBody.ts
```

The backend ships every error as a stable code (the registry constants behind `SKY0018`/`SKY0019`), enumerated into the
OpenAPI `ErrorBody.code`. This proves every code in the generated union has a catalog entry — so no error reaches a
user untranslated. It's the **coverage** half (code → copy); `i18n-parity.mjs` is the **parity** half (copy → every
language). It reads the orval-generated `errorBody.ts` union directly, and is a **notice until the client is
regenerated** against the enum-bearing contract, a hard gate after — so it never blocks before the codegen has run.

## Contract freshness — the client mirrors the live spec

```
node tools/contract-freshness.mjs <openapi.json> <client.gen dir>            # check (the doctor leg)
node tools/contract-freshness.mjs <openapi.json> <client.gen dir> --stamp    # stamp (run as the codegen tail)
```

The typed client is a **mirror** of the backend's OpenAPI document, and nothing re-checks the mirror after
generation — a backend shape change leaves the front compiling happily against a stale client, and every other
loop (endpoint coverage, error-code coverage, journey parity) inherits the drift because they read the client as
truth. This pins the client to the exact spec it was generated from: the codegen script ends with `--stamp`
(writes `client.gen/.spec-hash`, a whitespace-insensitive fingerprint), and the doctor compares the stamp against
the live spec. A mismatch is a build-time "the contract moved; regenerate", not a runtime 404. **Notice until the
first stamp exists**, a hard gate after — so it never blocks before the codegen has run.

## Client scaffold — the mutator + orval config (the hand-owned half of the wired guarantee)

```
node tools/client-scaffold.mjs <client-name> <contract-path> [target-dir]
# e.g.  node tools/client-scaffold.mjs shop ./contract/Shop.Api.json packages/app-core
```

orval generates the hooks, but the **mutator** they all call through (auth injection, the base-URL port, the
`X-Client: web` header that turns on the cookie session) and the **orval config** are hand-owned files nothing
scaffolded — every pilot re-derived them. This renders both, conformant by construction: the base URL is an
injectable default overridden at boot via `configureClient()` (the SKYFE020-blessed shape), the token sink is the
session seam's `setAccessToken`, the 401 rotation is the seam's single-flight `bootstrapSession` injected via
`setTokenRefresher` (one door, cookie AND body — never a cookie-only fork baked into the transport file), and the
audience filter keeps webhooks/internal endpoints out of the client (so endpoint coverage stays high-signal).
Existing files are never overwritten — they are hand-owned after birth.
