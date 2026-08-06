# Skies Node.js parity overview

This document is the readable overview of the Node backend peer of Skies .NET. The authoritative cross-runtime
catalog is [`parity/skies.parity.json`](../parity/skies.parity.json), validated by its closed
[JSON Schema](../parity/skies.parity.schema.json) and `tools/parity-guard.mjs`. **Parity** means the same
user-visible capability and enforcement strength where the platform permits it, not a mechanical translation of
ASP.NET, Roslyn, or EF APIs. Every machine-readable capability binds both implementations to executable evidence.

Status values are **done**, **equivalent**, and **adapter-specific**. There are no planned or active rows.

## Machine-readable parity contract

The manifest owns stable capability IDs, a relationship (`equivalent`, `wire-compatible`, or `adapter-specific`),
implementation scopes and executable proof paths for both runtimes, the complete `SKY####` mapping to a
`SKYN####` diagnostic or an explicit TypeScript mechanism, shared language-neutral contracts, and explicit
deferments. The guard fails closed when:

- a schema field is missing or unknown, an ID is duplicated or unsorted, or any declared path/glob resolves to no file;
- first-party behavior under an owned .NET or Node pattern is absent from the catalog;
- an implementation scope changes on only one runtime without an owned, justified, non-expired deferment for the
  missing counterpart; or
- a shared contract lacks consumers and a capability on both runtimes.

Proof-only improvements do not require an artificial counterpart source edit. Runtime pairing is computed only
from implementation scopes, while every proof remains resolvable and mapped. Deferments use an ISO expiry date
and name the owner, reason, capability, and temporarily missing side; an expired deferment is a failure.

```bash
npm run test:parity                         # guard regression suite
npm run check:parity -- --changed <path>   # focused local drift check
npm run check:parity -- --base <revision>  # branch/PR diff
node tools/parity-guard.mjs list
node tools/parity-guard.mjs explain <path>
```

CI fetches full history, validates the inventory and schema, and compares the current change with the event base.
This mechanism is deliberately **annotation-free**: it does not add TypeScript decorators, JSDoc tags, reflection,
or runtime metadata. Plain TypeScript stays plain; the external manifest, shared fixtures, tests, and CI own parity.

## Non-negotiable laws

- Generated applications are ordinary strict ESM TypeScript and Express 5, with explicit imports, dependencies,
  route registration, contracts, and composition.
- Removing ESLint, the workspace doctor, foundation files, and the CLI does not alter runtime behavior.
- There are no decorators, reflection discovery, base controllers, hidden DI container, generic repository,
  unit-of-work abstraction, generated behavior, ORM unifier, or synchronous ESLint filesystem scan.
- Node 24 and strict `NodeNext` are the published baseline. Socket.IO and PostgreSQL testing remain opt-in.

## Runtime and package parity

| .NET capability | Node peer | Status | Executable evidence |
|---|---|---|---|
| `Result<T>`, nine error kinds, factories and field errors | `@skiesjs/core` | done | Core typecheck and Result tests. |
| Validation accumulation, requirements and nested collection | `@skiesjs/core` | done | `validation.test.ts` covers accumulation and nested field preservation. |
| Page construction and metadata-preserving projection | `@skiesjs/core` | done | `page.test.ts`. |
| Ordered lifecycle | `@skiesjs/core` | done | `ordered-lifecycle.test.ts` proves order and rejects skip/regression. |
| Nominal scalar/wire codec | Core + OpenAPI | done | Scalar codec and primitive-schema tests. |
| Canonical Result-to-HTTP mapping | `@skiesjs/express` | done | Real Express/Supertest status, envelope, encoding, and exception tests. |
| Explicit endpoint metadata, kinds and operation IDs | Express + OpenAPI | done | Registry collision/projection tests and doctor `SKYN0012`. |
| OpenAPI 3.1, pages, scalars, numeric schemas, error enum | `@skiesjs/openapi` | done | Deterministic document tests plus strict Hey API generated-client compilation. |
| Rate limiting and `Retry-After` | `@skiesjs/rate-limit-express` | done | 14 fail-closed store/header/envelope tests. |
| Local stream storage and PUT/GET/ranges | Storage + Express adapters | done | Traversal, MIME, encoding, delete, streaming, range, and pilot HTTP proofs. |
| JWT issue/validation and current user | Auth + Express adapters | done | JOSE security matrix, real middleware tests, and bidirectional .NET/Node fixture. |
| Refresh-cookie contract | `@skiesjs/auth-express` | done | 32-case HTTPS, `127/8`, domain, path, clear, and precedence matrix. |
| Identity, mail and SMS ports/development adapters | Focused packages | done | Port/adapter behavior and failure-propagation tests. |
| Stable paging, count/select agreement, ownership and order | `@skiesjs/drizzle-postgres` | adapter-specific | `pagePolicy` unit proof and PostgreSQL 17 Testcontainers integration. |
| Optimistic versioning and explicit raw SQL | `@skiesjs/drizzle-postgres` | adapter-specific | `executeVersionedMutation` fan-out/conflict tests and branded `defineRawSql`. |
| Unit/integration/E2E/journey vocabulary and real host | `@skiesjs/testing` | done | Metadata/host tests and fail-closed `SkiesProofReporter` receipts. |
| PostgreSQL template cloning | `@skiesjs/testing-postgres` | adapter-specific | Refcount/race/cleanup unit tests and Docker isolation integration. |
| Omakase dependency bundle | `@skiesjs/framework` | done | Dependency-only exact versions; persistence, realtime and tests stay outside it. |
| Realtime contracts and auth | `@skiesjs/socketio` | done | 14 real server/client validation, JWT, ACK, abort, collision and teardown tests. |

Vendor SDKs remain external. The framework ships standards, ports, and development adapters, not provider lock-in.

## Doctor parity

Public Node IDs preserve meaningful .NET suffixes as `SKYN####`.

| IDs/capability | Status | Enforcement and evidence |
|---|---|---|
| `SKYN0001–0002`, `0006–0007`, `0011`, `0018`, `0022` | done | Recommended ESLint rules with exhaustive RuleTester fixtures. |
| `SKYN0003–0005`, `0015–0017` | done | Async workspace doctor proves co-location, context freshness, module registration and thin composition. |
| `SKYN0008`, `0010`, `0020`, `0033` | done | Exact happy/sad write journeys, response/state assertions and collected verdict requirements. |
| `SKYN0012` | done | Every mapped contract owns a unique operation ID. |
| `SKYN0018–0019` | done | Registry-only error declarations and cross-file ownership/use join. |
| `SKYN0022–0023` | done | Visible required-auth middleware and typed current-user consumption. |
| `SKYN0030–0032` | done | Criterion/proof bijection and no skipped or omitted evidence. |
| `SKYN0009`, `0024`, `0026–0028` | adapter-specific | Safer explicit Drizzle APIs and PostgreSQL proofs replace generic name matching. |
| `SKYN0013–0014`, `0021` | equivalent | Generated Drizzle entity shape tests and branded scalar codecs replace decorator/ORM inspection. |
| .NET `SKY0025` result guard | equivalent | Strict discriminated-union narrowing is stronger and needs no custom rule. |

The doctor parses files independently, joins normalized facts, has no TypeScript language-service dependency, and
its 31-case suite includes valid and invalid fixtures for every owned family.

## CLI and generator parity

| Command/capability | Status | Evidence |
|---|---|---|
| Transactional containment, dry-run, collision preflight, modes and rollback | done | `FilePlan` tests, including symlinks and injected rollback failure. |
| `new`, `g module`, `g context`, `g slice` | done | CLI tests and no-network fresh-app black box. |
| `g error-code`, `g value-object`, `g page`, `g storage`, `g auth` | done | Domain generator fixture corpus. |
| `g entity`, `g crud` | adapter-specific | Drizzle table/migration plus five explicit slices, real paging/version APIs and write journeys. |
| `g hub` | done | Uses the real opt-in `defineSocketEvent`/`SocketIoAdapter.register` API and adds dependencies atomically. |
| `g auth:otp`, `g auth:oauth`, `g auth:email` | done | Prerequisite/collision tests; digest/sealed state, expiry and replay-safe flows. |
| Criteria list/suggestion | equivalent | Closed `skies.node.json` plus foundation inventory/matrix/criteria commands expose exact uncovered bindings. |
| Foundation init/sync, NWC/NYA/RTW/WTW, context and check | done | Transactional asset/workflow tests and installed CLI smoke. |
| Doctor and affected/base/full gates | done | Foundation selection, dependency-closure, timeout, signal, receipt and Git-uncertainty tests. |
| Test mode selection | equivalent | Manifest proof kinds and base/full selectors execute ordinary project commands without hidden runner behavior. |
| Mutation calibration | done | Pilot Stryker gate requires a runtime-killed mutant and rejects survivor/no-coverage/timeout/runtime-error statuses. |

Generated code contains no CLI dependency. Complete file plans use LF, reject unknown flags and partial wiring, and
write ordinary application source.

## Gate, foundations and delivery parity

| Capability | Status | Executable evidence |
|---|---|---|
| Closed topology and proof manifest | done | Closed-schema fixtures, inventory and criteria coverage tests. |
| Suppression and unsafe-symlink scan | done | Stable-location suppression tests; dependencies/output excluded. |
| Affected/base/full scopes and explainable closure | done | Temporary-Git and runner/gate suites; unknown Git impact widens or fails closed. |
| Missing/skipped/untagged/timed-out/suppressed/unexecuted rejection | done | Reporter verdict tests plus foundation negative fixtures. |
| Criterion × proof × source × verdict matrix | done | Gate/config truth-table tests and pilot receipt artifacts. |
| `VERIFICATION.md/json` | done | Full-gate snapshots and uploaded nontrivial pilot receipts. |
| Repository-owned CSM foundations | done | Pinned lock/assets, exact sync, context and ordered check workflow tests. |
| Complete starter, hooks and CI | done | Installed-tarball/no-network fresh app passes lint, typecheck, tests, doctor, build and full gate. |
| Reference Express/Drizzle/Postgres pilot | done | Authenticated tenant paging, OpenAPI, storage range, journeys, mutation and PostgreSQL CI proof. |
| Linux/Windows/macOS Node 24 CI | done | `.github/workflows/ci.yml` matrix; Linux adds Docker integration and mutation. |
| npm release and immutable dependency order | done | Release guard, public/provenance publishing, and exact registry post-publish receipt. |
| Package export/install smoke | done | Every public tarball has an exact allowlist, installs offline, imports ESM/types, and exercises all three CLIs. |
| Dependency audit | done | Lockfile pins safe transitive versions; CI/publish run moderate-or-higher `npm audit`. |

## Objective completion evidence

- `npm run check` components are green; the authoritative unit run reports 43 files and 335 tests with no skip.
- `npm run package-smoke` passes the packed, isolated, offline consumer and fresh-app full gate.
- Pilot affected, base, and full gates are green and the proof reporter records all nine executed tests.
- Pilot mutation calibration is 100%: one runtime mutant killed and one compile-time mutant rejected.
- PostgreSQL 17 integration is typechecked locally and is executed by the Linux Docker CI lane.
- The bidirectional JWT fixture is verified by both the Node suite and 16 passing .NET auth tests.

No ledger row remains planned or active.
