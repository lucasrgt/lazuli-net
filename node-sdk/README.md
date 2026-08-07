# Skies Node.js

The Node.js peer of Skies: a Rails-minded convention framework for **plain TypeScript + Express 5**. Generated
applications use explicit imports, routers, contracts, dependencies, and tests. Remove both doctors and the
foundation gate and runtime behavior does not change. There are no decorators, reflection, controller bases,
directory discovery, generated behavior, or hidden DI container.

## Packages

| Package | Purpose |
|---|---|
| `@skiesjs/framework` | Dependency-only runtime/doctor omakase bundle; persistence and testing stay opt-in. |
| `@skiesjs/core` | `Result`, nine error kinds, Validation, Page, ordered lifecycle, and scalar codecs. |
| `@skiesjs/openapi` | Zod-backed contracts, live deterministic OpenAPI 3.1, error registries, and app-client projection. |
| `@skiesjs/express` | Contract mapping, request validation, domain-output encoding, and canonical HTTP responses. |
| `@skiesjs/auth` / `@skiesjs/auth-express` | HS256 access tokens, typed current user, required middleware, and refresh cookies. |
| `@skiesjs/identity`, `@skiesjs/mail`, `@skiesjs/sms` | Portable provider ports with explicit development fakes/adapters. |
| `@skiesjs/storage` / `@skiesjs/storage-express` | Secure streamed local files, MIME serving, and HTTP byte ranges. |
| `@skiesjs/rate-limit-express` | Explicit fail-closed 429 policies and standard rate-limit headers. |
| `@skiesjs/drizzle-postgres` | Tenant/filter policy, bounded unique-order paging, versioned writes, and audited raw SQL. |
| `@skiesjs/testing` / `@skiesjs/testing-postgres` | Proof vocabulary, real host lifecycle, and PostgreSQL 17 template clones. |
| `@skiesjs/socketio` | Opt-in explicit Socket.IO contracts and authenticated event mapping. |
| `@skiesjs/eslint-plugin-node` | Removable single-file `SKYN####` rules with no filesystem joins. |
| `@skiesjs/doctor` | Authoritative deterministic cross-file topology, journey, error, auth, and proof checks. |
| `@skiesjs/foundation` | Closed proof inventory, affected/base/full gates, receipts, and local CSM foundations. |
| `@skiesjs/cli` | Transactional starter and slice/module/domain/auth/storage/data/realtime generators. |

The dependency-only meta-package deliberately excludes Drizzle, PostgreSQL, Socket.IO, and test helpers. Applications
choose those satellites explicitly rather than receiving a false universal stack.

## Start and verify

```bash
cd node-sdk
npm ci
npm run check
npm run package-smoke
# Docker-enabled PostgreSQL 17 proof
npm run test:integration
```

Create an independently runnable application:

```bash
npx skies-node new billing-api
cd billing-api
npm install
npm run hooks:install
npm run gate:full
```

`new` emits a strict NodeNext application, explicit health contract, co-located proof, OpenAPI, all-platform Node 24
CI, Git hooks, `skies.node.json`, and pinned repository-local NWC/NYA/RTW/WTW assets. `g slice` emits
`defineContract`/`mapSlice`; writes are born with happy/sad journeys. Run `skies-node --help` for the complete
transactional generator catalog.

The nontrivial [`examples/pilot-api`](examples/pilot-api) consumes exact `0.1.0` packages and proves JWT identity,
tenant-scoped Drizzle paging, streamed/range storage, error registries, full/app OpenAPI, unit/integration/E2E/journey
metadata, suppression-safe gates, deterministic verification receipts, and mutation calibration.

See [`../docs/NODE-CONVENTIONS.md`](../docs/NODE-CONVENTIONS.md) for the constitution and
[`../docs/NODE-PARITY.md`](../docs/NODE-PARITY.md) for the executable acceptance ledger.

## Supply-chain pins

The workspace lock overrides `qs` to `6.15.3` and pins Hey API's schema-ref parser to API-compatible `1.4.1`.
Those pins avoid the upstream `typed-rest-client` and `js-yaml` advisories while the generated-client smoke proves
the combination still generates and strictly compiles the app OpenAPI projection. CI and publish fail on moderate
or higher `npm audit` findings.
