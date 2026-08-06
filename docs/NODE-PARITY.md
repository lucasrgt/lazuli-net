# Skies Node.js parity ledger

This ledger is the acceptance contract for making the Node.js backend a peer of Skies .NET. “Parity” means the
same user-visible capability and enforcement strength where the platform permits it—not a mechanical translation
of ASP.NET, Roslyn, or EF APIs. A row may close as **equivalent** only when the Node platform already proves the
invariant more strongly (for example, discriminated-union narrowing replacing `SKY0025`).

Status: **done**, **active**, **planned**, or **adapter-specific**. Nothing marked planned or active may be described
as shipped parity.

## Non-negotiable laws

- Generated applications are ordinary TypeScript and Express 5 with explicit imports and route registration.
- Removing the ESLint/workspace doctor removes enforcement only; the application still compiles and runs.
- No decorators, reflection discovery, base controllers, hidden DI container, generated behavior, or ORM unifier.
- Runtime packages, doctor, generator, tests, sample, CI, release, and fresh-app acceptance all ship together.
- Node 24 is the supported baseline. ESM and strict `NodeNext` TypeScript are mandatory.

## Technology decisions

| Concern | Decision | Boundary |
|---|---|---|
| HTTP | Express 5 | Official adapter, never imported by slice `handle`. |
| Result/errors | Plain discriminated TypeScript union | Vendor-neutral core. |
| Structural doctor | ESLint 9 plus a deterministic workspace doctor | No TypeScript language-service dependency for syntax/workspace facts. |
| Test runner | Vitest; Supertest for the real HTTP boundary | Runner coupling is deliberate, as xUnit is in .NET. |
| Reference persistence | Drizzle + PostgreSQL | Official adapter outside the meta-package; other ORMs require independent adapters. |
| Realtime | Socket.IO adapter, opt-in | Never on by default and not part of core. |
| Contracts | Explicit endpoint metadata plus build-time OpenAPI | Contract plumbing only; behavior remains visible. |
| CLI binary | `skies-node` from `@skiesjs/cli` | Avoids collisions with the .NET tool and existing npm package. |

## Runtime and package parity

| .NET capability | Node target | Status | Acceptance evidence required |
|---|---|---|---|
| `Result<T>`, nine `ErrorKind` values, field errors and factories | `@skiesjs/core` | done | Strict typecheck and unit tests. |
| `Validation` accumulation, `Require`, `NotBlank`, `InRange`, nested `Collect` | `@skiesjs/core` | planned | Behavior table including nested field preservation. |
| `Page<T>` and metadata-preserving projection | `@skiesjs/core` | planned | Empty/past-end/projection tests. |
| `OrderedLifecycle` | `@skiesjs/core` | planned | Order, exact advance, no skip/regression tests. |
| Scalar value-object wire codec | `@skiesjs/core` + OpenAPI | planned | Valid/invalid inbound and primitive schema tests. |
| Result-to-HTTP mapping | `@skiesjs/express` | done | Supertest success, custom success status, failure envelope, exception forwarding. |
| Slice-aware endpoint metadata and operation IDs | `@skiesjs/express` | planned | Typed API and metadata inventory tests. |
| `/openapi/v1.json`, schema IDs, pages, scalar VOs, numeric schemas, error-code enum | `@skiesjs/openapi` | planned | Normalized OpenAPI snapshots and generated-client smoke. |
| Endpoint kinds: app/asset/webhook/internal | Express/OpenAPI registry | planned | Client contract excludes non-app kinds. |
| Rate-limit error and `Retry-After` | Express adapter | planned | 429 envelope/header tests. |
| Local storage plus PUT/GET/range routes | `@skiesjs/storage` + Express | planned | Traversal, encoding, MIME, range, idempotent delete tests. |
| JWT issue/validation and current user | `@skiesjs/auth` + `@skiesjs/auth-express` | planned | JOSE security cases and bidirectional .NET/Node fixtures. |
| Refresh cookie contract | `@skiesjs/auth-express` | planned | HTTPS/loopback/domain/path/clear/precedence matrix. |
| External identity port and fake | `@skiesjs/identity` | planned | Blank/nonblank and provider-verified contract tests. |
| Mail and SMS ports with console adapters | `@skiesjs/mail`, `@skiesjs/sms` | planned | Output and failure propagation tests. |
| File storage port/local adapter | `@skiesjs/storage` | planned | Stream and path-security tests. |
| EF paging | `@skiesjs/drizzle` | adapter-specific | Same filter for count/items, clamp, order and PK tie-break tests on Postgres. |
| Unit/Integration/E2E/Journey vocabulary and real app host | `@skiesjs/testing` | planned | Analyzer-readable metadata and override-before-seed host tests. |
| EF in-memory testing | No false generic analogue | equivalent | Reference apps use real Postgres; an adapter may add PGlite with explicit limitations. |
| Postgres template cloning/Testcontainers | `@skiesjs/testing-postgres` | planned | Live Docker isolation/refcount/race/cleanup tests. |
| Dependency-only omakase meta package | `@skiesjs/framework` | planned | Export/install smoke; ORM and testing remain opt-in. |

Provider SDK integrations remain external packages. The official framework ships standards and development adapters,
not Twilio, SendGrid, Google, S3, or other vendor-specific runtime dependencies.

## Doctor parity

Public Node IDs retain the .NET numeric suffix as `SKYN####`; intentional holes are preferable to unrelated
renumbering.

| IDs | Status | Enforcement owner |
|---|---|---|
| `SKYN0001` slice spine/order | done | ESLint. |
| `SKYN0002` thin Express boundary | done | ESLint. |
| `SKYN0003` co-located test | active | ESLint smoke now; workspace doctor becomes authoritative. |
| `SKYN0004–0005` module context and citation freshness | planned | Workspace doctor. |
| `SKYN0006–0007` no repository/UoW and 500-line ceiling | planned | ESLint after generated topology is stable. |
| `SKYN0008`, `0010`, `0020`, `0033` write journey obligations and evidence | planned | Workspace doctor plus actual Vitest verdict inventory. |
| `SKYN0009`, `0024`, `0026–0028` ownership/raw SQL/concurrency/bounds/order | adapter-specific | Drizzle/Postgres doctor; never generic name matching. |
| `SKYN0011` tests under source | planned | ESLint/path inventory. |
| `SKYN0012` operation ID | planned | Endpoint metadata plus doctor. |
| `SKYN0013–0014`, `0021` entity/value-object nominal shape | adapter-specific | Only if one plain TS convention is proven; no decorators. |
| `SKYN0015–0017` module shape, registration and thin composition root | planned | ESLint plus workspace import/call index. |
| `SKYN0018–0019` registry-only and non-orphan error codes | planned | ESLint plus workspace doctor/OpenAPI inventory. |
| `SKYN0022–0023` explicit real auth posture/current-user use | planned | Runtime middleware metadata plus workspace/scope checks. |
| `.NET SKY0025` result guard | equivalent | Strict TypeScript discriminated-union narrowing is stronger; no custom rule. |
| `SKYN0030–0032` criterion/proof binding and no omitted tests | planned | TOML inventory, lint smoke, Vitest collected results. |

Each rule needs valid and invalid fixtures. Workspace rules parse files independently and join normalized facts; they
must not rely on editor language-server state or global basename matching.

## CLI and generator parity

| Command/capability | Status |
|---|---|
| Safe help, strict args, `--dry-run`, no overwrite | done for `g slice`; planned as shared transactional file-plan engine. |
| `new` complete application | planned |
| `g module` | planned |
| `g slice` source + test | done |
| Slice spec criterion, AVP proof, error registry and happy/sad journey | planned |
| `g entity`, `g vo`, `g crud` | planned against the Drizzle convention |
| `g hub` | planned as opt-in Socket.IO adapter |
| `g auth` with tenancy/cookie variants | planned |
| `g auth:otp`, `g auth:oauth`, `g auth:email` | planned |
| `criteria list/suggest` | planned from a checked-in neutral catalog/binding manifest |
| `foundations init/sync` and CSM wrappers | planned |
| `context` bounded WTW/RTW/NYA/NWC retrieval | planned |
| `check` composed gate + four foundations | planned |
| `doctor`, affected/staged/base/full `gate` and receipts | planned |
| `test --unit/--integration/--e2e` | planned |
| `mutate` via StrykerJS | planned |

All generators must preflight a complete explicit file plan, apply atomically, reject unknown flags, expose JSON/dry
run output, preserve LF, refuse partial wiring, and produce ordinary runtime code with no CLI dependency.

## Gate, foundations and delivery parity

| Capability | Status | Completion proof |
|---|---|---|
| Closed topology manifest and workspace inventory | planned | Valid/invalid fixture corpus. |
| Suppression scan | planned | Every disable class caught; build/generated directories excluded. |
| Staged/affected/base/full Git scopes and explainable dependency closure | planned | Temporary Git repositories and differential fixtures. |
| `tsc` + ESLint/workspace doctor with warnings fatal | active | Node CI lane exists; workspace doctor pending. |
| Unit/integration/E2E/AVP execution and skipped/not-run rejection | planned | Vitest JSON inventory and calibrated failures. |
| Manifest × slice × criterion × proof × verdict matrix | planned | Complete truth-table tests. |
| Console plus full-only `VERIFICATION.md/json` | planned | Deterministic snapshot tests. |
| CSM installation/provenance/init/sync/context/check | planned | No network mutation during help/context/check; exact step-order fixtures. |
| Complete starter with hooks, CI and foundation files | planned | Golden inventory and fresh-app black-box gate. |
| Reference Express/Drizzle/Postgres app | active | Health slice exists; wallet/auth/storage proofs pending. |
| Linux/Windows/macOS Node 24 CI | planned | Required status on all supported hosts. |
| npm release, immutable-version guard, dependency order | active | CI/publish/release-unit integration exists; provenance and post-publish install receipt remain. |
| Package export/install smoke | active | Dry packs pass; isolated install/import test pending. |

## Wave order

1. **Foundation (active):** package workspace, core Result/errors, Express boundary, three structural rules, slice CLI,
   sample, docs, CI and release.
2. **Portable runtime:** Validation, Page, lifecycle, scalar codecs, storage, identity, mail and SMS.
3. **Typed HTTP contract:** endpoint metadata, explicit auth/kind, OpenAPI and client generation smoke.
4. **Security:** JOSE auth/current user/cookies/rate limiting and cross-runtime fixtures.
5. **Reference data stack:** Drizzle/Postgres paging, ownership, raw SQL, concurrency and testing harness.
6. **Semantic doctor:** context, composition, error registry, auth and persistence rule families.
7. **Proof/gate:** criteria, journeys, Vitest verdict inventory, affected closure, matrix, receipts and CSM composition.
8. **Generators/template:** transactional complete generator family and black-box fresh application.
9. **Parity closeout:** all-platform CI, npm consumption by a real pilot, differential/golden audit, no planned rows left.

## Objective completion gate

The Node objective is complete only when:

1. Every row above is **done**, **equivalent with a stronger executable proof**, or **adapter-specific and complete for
   the official Drizzle/Postgres adapter**.
2. Every shipped package passes build, lint, unit/integration tests, package export smoke, and immutable release guard.
3. A freshly generated app installs from package artifacts and passes doctor, staged, affected, base and full gates.
4. Full verification produces deterministic `VERIFICATION.md` and `VERIFICATION.json` with no missing proof.
5. A real Node pilot consumes versioned packages—never source copies—and its auth, storage, write journeys, OpenAPI
   client, and Postgres behavior pass end to end.
6. The final audit compares this ledger with the live package/doctor/CLI inventories and finds no unsupported parity
   claim.
