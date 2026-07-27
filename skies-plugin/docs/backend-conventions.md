# Skies — Backend conventions

Opinionated .NET convention bundle (Rails mindset). Vertical-slice architecture.

## Shape

`src/<App>.Api/`: `Program.cs` (thin index: AddSkies + AddPlatform + AddModules and the
matching Use/Map — nothing else), `AppDb.cs` (ONE DbContext), `Platform/` (app cross-cutting,
one partial per concern: Persistence, Security, Observability, Web), `Modules.cs` (explicit
registry, no reflection), `Modules/<Module>/` (bounded contexts: entities + `Slices/` +
`<Module>.ctx.md`), `BuildingBlocks/` (shared VOs), `Journeys/` (E2E), `tests/<App>.Tests/`
(test runner infra only — test code lives in src/).

## Slices

One feature = one file (maximal locality): Input, Output, Handle, Map all visible. Handler uses
AppDb directly — never a repository or unit-of-work. Returns `Result<Output>`; boundary maps via
`ResultHttpExtensions.ToHttp()`. Validation inline at the top of Handle (`Check`, `Collect`,
`Require`, `NotBlank`, `InRange`) then `if (validation.Failed) return validation.ToError()` —
rules live in types, inline stays short.

## Errors

`Error = (Kind, Code, Message, Fields)`. Kind is a closed category → HTTP status. Code is a
STABLE key (`wallets.insufficient_funds`), namespaced `<module>.<reason>` / `<vo>.<reason>` /
`<field>.<reason>`, declared as a const on a `*ErrorCodes` registry class. Message is a
developer hint in English — never user-facing copy (that lives in frontend i18n keyed by Code).

## Domain

Rich value objects over primitives — `Money`, `Email`, `Cpf`: the type is the rule, readable by
AI without hunting validators. Entities expose intention-revealing methods (Deposit/Withdraw),
never public setters; every path funnels through `EnsureValid()`. EF never sees a broken entity.

## Modular monolith

One AppDb shared; modules are bounded contexts by convention. A module writes ONLY its own
entities; reads/joins/in-process calls across modules are free. Reference other modules by id,
never EF navigation/FK. Cross-module effects go through the owner's service or a job; domain
events + outbox are reserved for genuinely-async external work (webhooks). Extracting a module
later re-platforms only the reads.

## Real-time (opt-in)

SignalR hub scaffolded under `Modules/<Module>/Realtime/`. The hub is wire: it calls the
matching slice (one source of rules) and fans the result to the room. Ephemeral signals
(typing, presence) live in an in-memory singleton on a single instance; scaling swaps in a
backplane + Redis at the composition root. Caller identity from `Context.User` via
`ClaimsCurrentUser` (outside the HTTP pipeline).

## Testing

Co-located next to the slice (`Deposit.Tests.cs` beside `Deposit.cs`), categorized
[Unit]/[Integration]/[E2E]. Every slice declares at least one criterion in its module
`*.spec.toml` and carries an exact subject-bound executable `[AVP]` proof. Host:
`SkiesWebTest<TProgram>` boots the real app;
`SwapStores(IServiceCollection)` reconfigures stores for tests — in-memory
(`UseIsolatedInMemory<Db>()`) or real Postgres (`Skies.Framework.Testing.Postgres`, Testcontainers
template clone per test, pooled). Every shape-derived write proves both paths with isolated
`*Journey.Tests.cs` E2E cases: happy reaches its terminal state; sad proves rejection AND unchanged
state. Read/write is derived from ordinary code and ambiguity receives the write bar. No marker,
manifest mode, skip, or agent judgment can weaken the obligation. `skies gate --affected` executes the complete
Git-derived closure; `skies gate --full` executes every proof before release. Unaffected is never reported as pass.

## ctx.md (per module — the business "why")

Spine (required): `# <module>` purpose (1-3 lines) + `## Boundaries` (inside/outside/non-goals)
+ `## Design notes` (invariants + rationale — the gems). Optional: `## Wiring`,
`## Not yet ported`. Excluded by design (they'd drift): data models, DTOs, routes, error lists,
test matrices, examples, diagrams, changelogs. Freshness = citations resolve, not mtime.
