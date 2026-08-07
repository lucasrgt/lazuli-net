# Port-back checklist — what the hostpoint pilot earned that the framework must own

**Created:** 2026-06-08. **Status:** in progress (branch `framework/portback-audit`).

Skies grew by dogfooding in the **hostpoint** pilot
(`c:/Users/lucas/dev/dotnet-projects/hostpoint-monorepo`) without a disciplined port-back. This
checklist is the audit of every generic mechanism the pilot accumulated that the framework should own
but doesn't — plus the framework claims that aren't actually shipped. App-specific material (per the
80/20 scope discipline) is listed under "Correctly app-owned" and is deliberately NOT ported.

Headline: the backend **core** is real and complete (17 `SKY00xx` analyzers + base runtime lib). What
never came back is the **workspace/monorepo layer**, the **frontend harness foundation** (the "wired
guarantee"), and a few **claimed-but-absent** rules. The pilot is carrying the framework.

Legend: `[ ]` todo · `[~]` partial · `[x]` done · scope = FRAMEWORK-GAP / AMBIGUOUS / APP-SPECIFIC.

## Progress — 2026-06-08 (branch `framework/portback-audit`)

**Shipped + tested this session (9 gaps closed; full solution green — Doctor 67, Cli 22, SelfHarness 5,
Abstractions 4, Sample 21, SDK tools 28, eslint plugin all):**
SKYFE015 (no-router-replace-in-effect, ported) · SKYFE008 (endpoint-coverage tool, was claimed-but-absent) ·
SKYFE-JOURNEY-002 (e2e terminal-depth) · tenancy scaffold hardening (encapsulated OrgId + metadata stamp) ·
SKY0006 (no-repository) · SKY0007 (file ≤500) · SKY0020 (journey asserts its post-condition) ·
`OrderedLifecycle<TState>` helper · `Skies.toml` scaffolded by `skies new` + read/validated by the doctor.

**Deferred follow-up (each blocked on a real dependency, not skipped):**
frontend application scaffolding · the Tier B4 seam-rule feasibility spike · periodic mutation-depth audit. The
AMBIGUOUS items (IUserScoped, etc.) stay parked per the framework's own ≥3-pilot rule.

---

## P1 — broken promise / claimed-but-absent

- [~] **Scaffold a real project + `Skies.toml`.** _Done:_ `skies new` now scaffolds `Skies.toml`
  (`templates/skies-app/Skies.toml`, substituted from the project name), and the CLI finally READS it —
  `src/Skies.Framework.Cli/SkiesManifest.cs` validates `[workspace]`/name + that declared backend/core paths exist,
  wired into `skies doctor` (missing = notice, broken = failure) with 4 tests. _Still pending (tied to the
  deferred frontend generator):_ scaffolding the monorepo plumbing (`package.json` workspaces, `turbo.json`,
  `lefthook.yml`, `clients/`) and making `Skies.toml` *generate* the workspace/turbo config.
  - hostpoint: `Skies.toml`, root `package.json`, `turbo.json`, `lefthook.yml`
- [x] **App-owned stock client generation (the "wired guarantee").** Applications expose
  `npm run gen:client` over orval and their checked-in OpenAPI/config; contract freshness and generated-hook
  consumption are framework-gated. The framework does not advertise a second task-orchestrator surface.
- [x] **`SKYFE008` endpoint-coverage — claimed "shipped", absent.** _Done:_ implemented as
  `frontend-sdk/tools/endpoint-coverage.mjs` (pure `extractHooks` + `checkEndpointCoverage` core + CLI
  tail) with a vitest twin; the doc claim now points at the real tool. _was FRAMEWORK-GAP (truthfulness)._
- [x] **`SKYFE015` no-router-replace-in-effect — real rule, not ported + ID collision.** _Done:_ ported
  to `frontend-sdk/packages/eslint-plugin/index.cjs` (+ self-test), claimed SKYFE015 for the navigation
  rule, moved the planned "no orphan placeholder" to SKYFE016 (`docs/FRONTEND-CONVENTIONS.md`). A
  battle-tested rule in the pilot (`hostpoint/clients/eslint-plugin-skies/index.cjs:438`, born from a
  shipped infinite-navigation bug) is absent from the framework plugin, and its ID collides with a
  *planned, different* SKYFE015 ("no orphan placeholder") at `docs/FRONTEND-CONVENTIONS.md:275`.
  _FRAMEWORK-GAP._
- [x] **Real-backend E2E guard has a framework home.**
  `skies-frontend-sdk/playwright-backend` ships `probeBackend`, `createBackendGlobalSetup`,
  `observeBackend`, plus `expectBackendSlices` or bounded `waitForBackendSlices`. The doctor verifies the exact case and checked-in OpenAPI
  contract, rejects request interception/mock support and direct API calls in a backend-bound spec, and the
  branded runtime ledger requires both a successful `PW_API_URL` preflight and observed page responses matching
  every declared slice operation. Seed contents and Playwright process orchestration remain app-owned.

## P2 — generic mechanism carried by the pilot, should graduate

- [ ] **The 5 `skyfe-*.mjs` doctor scripts are reimplementations, not SDK consumers.** They re-derive
  `walk`/regex/`bucket`/`aggregateReport` inline; the framework already exposes the pure cores
  (`checkJourneyParity`, `checkE2e`, `aggregateReport`, `i18n-parity`, `error-code-coverage`).
  _FRAMEWORK-GAP (anti-drift)._ (resolved by the public `skies-*` package line)
- [ ] **Publish `@skiesjs/react`.** Unpublished → the pilot forks `AsyncState`/`Resource` locally and
  they are drifting. _FRAMEWORK-GAP._ (npm publish is an outward release step — prepare, don't publish)
- [x] **Harden the tenancy scaffold (`skies g auth`).** _Done:_ `ITenantScoped.OrgId` is now `{ get; }`
  (read-only); `TenantDbContext` stamps via EF property metadata (`entry.Property(...).CurrentValue`),
  not the CLR setter, + exposes `CurrentOrgId`; `User.OrgId` is `{ get; private set; }`. The shipped
  `TenantIsolation.Tests` already assumed this (seeds without OrgId, asserts the stamp), so the change
  aligns the entity/interface with the test. Did NOT port `IParticipation` (1-pilot, AMBIGUOUS).
  _Follow-up:_ the `crud` test scaffold seeds `new() { OrgId = org }` (cross-org isolation), which needs
  a settable OrgId — a seed-helper is required before crud entities can also go `private set`.
- [x] **Remove the imaginary task orchestrator.** `Skies.toml` is topology-only; task sections and platform
  arrays are rejected rather than retained as inert configuration. Real build/codegen commands remain visible in
  project and package scripts.
- [x] **`OrderedLifecycle<TState>` helper.** _Done:_ `src/Skies.Framework.Abstractions/OrderedLifecycle.cs` —
  `Reached` (cursor ≥ step) + `Advance` (no-skip/no-regress), generic over `TState : struct, Enum`, with a
  new `tests/Skies.Framework.Abstractions.Tests` project (4 green, wired into `Skies.Framework.slnx`). Replaces the
  byte-for-byte Host/Traveler duplication.
- [x] **`SKY0006` no-repository + `SKY0007` file ≤500 (user apps).** _Done:_ both shipped as Roslyn
  analyzers (`analyzers/Skies.Framework.Doctor/NoRepositoryAnalyzer.cs`, `FileSizeAnalyzer.cs`) with twin tests
  (7 green); `docs/CONVENTIONS.md` flipped planned→shipped. _was FRAMEWORK-GAP (documented commitment)._

## Complete verification (decision `skies-framework-fail-closed-verification.md`)

- [x] **Terminal depth** — every curated flow declares and asserts its terminal.
- [x] **Backend assertion depth** — happy proves effect; sad proves rejection and unchanged state (`SKY0020`).
- [x] **No disabled evidence** — skip/focus syntax and `NotExecuted` verdicts fail the gate.
- [x] **Full-stack subject binding** — every ViewModel owns Assay plus happy/sad E2E, and linked flows name exact
  features and consumed backend hooks.
- [x] **Fail-closed inventory** — write depth is shape-derived; frontend proof packages are independently
  inventoried; CI must directly invoke `skies gate`.

## Re-sweep 2026-06-09 — new findings (not previously tracked)

A second audit pass over the pilot, after the SKY0022–26 / SKYFE021–22 wave. Claims verified against the
framework source (several apparent gaps turned out already owned: `ClaimsCurrentUser` ships in
`Skies.Framework.Auth`; refresh rotation + theft detection and `TenantDbContext` ship as `skies g auth`
scaffold templates — the Skies way, app-owned by construction).

**Progress — 2026-06-09 (same day):** all six findings attacked. Scalar VO transparency →
`ScalarJsonConverter<TVo,TPrim>` (Abstractions) + automatic schema mirroring in `AddSkiesOpenApi`,
dogfooded on the sample's `Money`. Postgres harness → `Skies.Framework.Testing.Postgres` (`PostgresTestDatabase`).
Rate-limit bridge → `RejectAsSkiesError()` + the framework's `PlatformErrorCodes`. Session seam →
`createSessionSeam` + `useSession` in `@skiesjs/react` (cache reset paired by construction). Error-copy
bridge → `apiErrorCode`/`apiErrorCopy` in the spine (structural i18n). Mutator → `tools/client-scaffold.mjs`
(mutator + orval config, SKYFE020-conformant). Pilot mirror rebased to plugin 0.4.0 with SKYFE021/022 adopted —
zero new errors, full lint chain + typecheck + 125 tests green. Still open from the reverse-drift item: the
app adopting the spine unions themselves (blocked on `@skiesjs/react` publish, tracked in P2).

### Backend

- [x] **Scalar VO wire transparency has no framework mechanism.** Every scalar `[ValueObject]` the
  pilot adds needs a hand-written `[JsonConverter]` + a per-type branch in the `Web.cs` OpenAPI
  schema transformer (`hostpoint/src/Hostpoint.Api/Platform/Web.cs:52`, `Money.cs:54`, `Slug.cs:46`)
  or the contract emits an empty object and the generated client breaks. The mechanism is generic:
  a `Skies.Framework.AspNetCore` schema-transformer that maps a `[ValueObject]` with a primitive-writing
  converter to its primitive schema (`Money`→`int64`, `Slug`→`string`). _FRAMEWORK-GAP — this is the
  pilot's most repeated per-feature toll._
- [x] **Testcontainers Postgres harness with template-database cloning.**
  (`hostpoint/tests/Hostpoint.Tests/TestDatabase.cs`) One container, one migration into a template DB,
  then `CREATE DATABASE … TEMPLATE` per test/keyed group, with a tiny aggressively pruned pool. `Skies.Framework.Testing` ships only the
  WebApplicationFactory harness + InMemory; the real-database leg every serious pilot needs lives in
  the app. Candidate: `Skies.Framework.Testing.Postgres`. _FRAMEWORK-GAP._
- [x] **Rate-limiting wired to the error envelope.** The pilot wires ASP.NET's limiter and renders 429
  as the framework's `ErrorBody` with a `platform.rate_limited` registry code
  (`hostpoint/src/Hostpoint.Api/Platform/RateLimiting.cs`). The framework owns `ErrorKind.RateLimit` and
  the envelope but ships no limiter↔envelope bridge; each app re-derives the `OnRejected` glue. Port the
  bridge (policies stay app-owned). _FRAMEWORK-GAP (the glue), policies APP-SPECIFIC._
- [x] _(convention, doc-only)_ **`PlatformErrorCodes` registry** — platform-tier codes (rate limit, etc.)
  live in one `*ErrorCodes` class so SKY0018/19 + the OpenAPI enum pick them up like module codes.
  Document in CONVENTIONS (platform layer section); no code needed.
- [ ] _(hold, 1-pilot)_ JSON-list `ValueConverter`+`ValueComparer` helper; sandbox env-gated vendor
  tests (`Sandbox.cs`); reflection seed-helper for encapsulated entities (`TestUser.cs`); presigned-URL
  memoization in an eventual `Skies.Framework.Storage.S3`.

### Frontend

- [x] **The session seam has no framework home.** `signIn` / `bootstrapSession` /
  `clearSession` + the `useSession` boot hook + the `refresh-token.ts`/`.web.ts` platform-seam pair
  (`hostpoint/clients/app-core/src/lib/session/*`) are the generic mechanics SKYFE016/017 *steer
  toward*, yet the spine ships only the read-side (`SessionState`). The write-side trio (token write
  paired with the correct identity/rotation cache reset by construction) belongs in
  `@skiesjs/react` (storage injected as a port). _CLOSED — the spine now ships the seam._
- [x] **`apiErrorCopy()` — the error-code→copy bridge.**
  (`hostpoint/clients/app-core/src/lib/api-error.ts`) Reads `ErrorBody.code` off an axios error, looks
  up the `api-errors` i18n namespace, falls back to a generic key. It is the runtime half of the
  `error-code-coverage` loop (the tool proves the catalog is complete; this consumes it). Generic —
  graduate to the spine or ship in the scaffold. _FRAMEWORK-GAP._
- [x] **Mutator/`configureClient` template.** The orval mutator (`skies-client.ts`: auth injection,
  base-URL port, `Result` envelope) + boot-time `configureClient()` exist only in the pilot; the SDK's
  `generate.mjs` scaffolds features against a client whose mutator nothing scaffolds. Folds into the
  app-owned stock client-generation path; listed here so the mutator template remains part of that contract.
- [~] **Reverse drift (pilot behind framework).** The hostpoint `@skiesjs/eslint-plugin` mirror is
  v0.3.0 — missing SKYFE021/022 and the hardened SKYFE002/011/013/016/018 — and the app forks
  `AsyncState` locally while not using the spine's `SessionState`/`requiredParam`/`combineAsyncStates`
  at all (guards still branch on a raw `session.ready` boolean — exactly what SKYFE017 exists to
  prevent). Both are symptoms of the tracked "@skiesjs/react publish" gap; flagged so the next pilot
  sync rebases the mirror + adopts the spine unions.

## Design dogfood 2026-06-09 — pauta (the Design SDK wave, `.specs/` 0007)

The design layer (tokens + closed kit + SKYFE024–026) wired into `pauta-web/frontend` (Next 15 +
Tailwind, aerocoding-generated, zero prior Skies wiring). Mirror at 0.6.0, band warn-first globally,
error on `src/ui/**` + the relifted exemplar (`billing-type-edit`, the form recipe instantiated on a
real screen; `window.confirm` replaced by the app-owned `Dialog`). Gate: lint 0 errors, 456 tests green
(98 files, 8 new). Per-rule verdicts:

- [ ] **The band is blind to Tailwind utility classes.** _portback, HIGH._ Baseline: **0 findings over
  533 files** — yet the visual rot is everywhere, living in `className` utilities (`bg-red-100`,
  `text-blue-600`, `border-red-400`). SKYFE026 checks style-object keys + string literals; SKYFE025's
  only className leg is the arbitrary-value `[Npx]` regex (never fired — aerocoding used stock classes).
  A Tailwind-classes web app — the most common web stack — escapes the band almost entirely. Needed:
  a className leg for SKYFE026 (flag `(bg|text|border|ring|fill|stroke)-(red|blue|…)-N` palette-family
  utilities outside `ui/` once tokens exist) and a decision on whether stock-scale spacing utilities are
  conformant (they are A scale — arguably fine) vs palette utilities (never fine).
- [x] **`scrim` color role.** _portback — shipped inline (inner loop)._ The Dialog's backdrop had no
  semantic role; raw `rgba()` in `ui/` would trip SKYFE026. Added to the taxonomy + default themes
  (skies-framework commit `37785aa`), re-scaffolded into both token instances.
- [ ] **`'use client'` banners on the hooky kit primitives.** _portback, MEDIUM._ Next App Router needs
  them on Button/Input/Field (useState); added app-side in pauta. Harmless on non-Next — candidate for
  the `renderUiKitWeb` template (+ Dialog when it graduates).
- [ ] **`Input` has no date/datetime kind.** _portback, LOW._ The generated forms used
  `type="datetime-local"`; the kit's closed `kind` union stops at text/email/password/number. Wait for a
  second real need before widening the union.
- [ ] **Dialog — kit-v2 candidate evidence, pilot #1.** Built app-side per the constitution (scrim +
  overlay tokens, focus in/return, Esc/backdrop, sentinel trap; 4 tests). A second pilot needing it =
  graduate into the scaffold.
- **SKYFE024 inertia outside the blessed naming.** _observation, wave-order._ ui-door anchors on
  `*.view.tsx`; pauta's screens are `page.tsx` + `components/*Form.tsx`, so the rule only bites surfaces
  as they adopt the blessed shape (the relift exemplar does). Adoption order: naming first, then the
  rule has teeth — the full-harness wave's concern, not the band's.
- **Audit fields as editable form inputs.** _app-owned._ The generated forms expose
  `deletedAt`/`deletedBy`/`createdBy`/`updatedBy` as text inputs; the relift drops them (the partial
  update schema makes the narrower payload legal). A relift-pattern note in pauta's worklist, not a
  framework mechanism.
- **Relift fan-out is staged, not done.** "Todas as telas" = the next wave: per-feature cells dispatched
  from `pauta-web/frontend/docs/design-relift-worklist.md` (3 generated patterns × ~36 entity pairs),
  now that the pattern is proven on the worst offender.

## P3 / AMBIGUOUS — wait for ≥3-pilot evidence (per the framework's own rule)

- [ ] _(hold)_ `IUserScoped` (global user-owned data) — generic in shape, 1-pilot evidence.
- [ ] _(hold)_ blanket `Money`→bigint converter + a VO↔EF-converter analyzer — 1 instance each.
- [ ] _(hold)_ CI workflow template / starter Dockerfile / `dotnet-tools.json` in scaffold — judgment.
- [ ] **Scaffold interceptor: adopt hostpoint's injected-refresher shape.** The scaffolded mutator's 401
  interceptor (plugin-0.7.0 wave) bakes a cookie-mode `REFRESH_PATH` post — web-only. Hostpoint's
  generalization is better: the client exposes `setTokenRefresher(fn)` and the session seam registers its
  `bootstrapSession` (single-flight AT THE DOOR — several callers share one in-flight rotation), so the same
  interceptor serves cookie AND body modes and the rotation logic stays in the seam. 2-pilot evidence
  (pauta = direct-post shape, hostpoint = injected shape); graduate the injected shape into
  `client-scaffold.mjs` when touched next.

## Correctly app-owned (NOT gaps — must stay in the pilot)

`Cpf`/`Cnpj`/`Cep`/`BrazilianPhone`, `Address`/`Gender`/PostGIS `Geo`, `fly.toml`/`deploy.ps1`,
`e2e/support/actors.ts` (personas + pt-BR labels), the role-switch resolution policy, and the
`flows.json` contents (the curated list is per-app; the schema is framework-owned).

---

## Working order

1. Decision-doc fixes (SKY0011→SKY0020, baseline) — cheap correctness.
2. Truthfulness: SKYFE008 tool + SKYFE015 port — stop the framework lying about what it ships.
3. Contained analyzers: SKY0006, SKY0007, the journey-body SKY0020.
4. Tenancy scaffold hardening + OrderedLifecycle helper.
5. E2E real-backend guard + unconditional execution in the gate.
6. Foundation: `Skies.toml` scaffold + closed manifest reader + app-owned stock client generation.
7. `@skiesjs/react` publish-readiness; then rewrite the pilot's 5 scripts as thin SDK CLIs.
