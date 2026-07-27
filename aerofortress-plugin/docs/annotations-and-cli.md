# AeroFortress — Annotations & CLI

## Backend markers (pure attributes; inert if the doctor is removed)

- `[Slice]` — operation: nested `Input`/`Output` records, `Handle(Input, AppDb, CancellationToken) → Task<Result<Output>>`, `Map(IEndpointRouteBuilder)`, all four in order.
- `[Module]` — static class exposing `AddServices(IServiceCollection, IConfiguration)` + `Map(IEndpointRouteBuilder)`.
- `[ValueObject]` — immutable, no public ctor/setter, smart constructor returning `Result<T>`, always-valid.
- `[Entity]` — private ctor (EF rehydration), private setters, private `EnsureValid() → Result<T>` funnel on every create/mutate path.
- `[AVP(typeof(Slice), "criterion-id")]` — executable acceptance proof for the exact criterion
  declared by that slice in `<Module>.spec.toml`; every slice has at least one.
- `[Journey(typeof(Slice), JourneyPath.Happy|Sad)]` — on an `[E2E]` `[Fact]`/`[Theory]` in
  `*Journey.Tests.cs`; binds exactly one path to a shape-derived write slice. Every write has both
  paths, and sad proves rejection plus unchanged state.
- `[Unit]` / `[Integration]` / `[E2E]` — xUnit traits categorizing co-located tests.
- `[JsonConverter(typeof(ScalarJsonConverter<TVo, TPrim>))]` — scalar VO crosses the wire as its primitive; OpenAPI schema mirrored by `AddAeroFortressOpenApi`.
- `[Endpoint(...)]` — endpoint nature: default `App`; `[Endpoint(Webhook)]`, `[Endpoint(Internal)]`, `[Endpoint(Audience = "admin")]`. Drives the orval audience filter.

## Frontend markers (file/folder conventions)

- `<Name>.view.tsx` — pure render, exactly one ViewModel.
- `<Name>.viewModel.ts` — hook `use<Name>Model()`, render- and platform-agnostic.
- `<Name>.test.tsx` — co-located test (renderHook for VMs, Providers render for Views).
- `<name>.i18n.ts` — per-feature locale namespace.
- `features/<zone>/<name>/` — screens grouped by audience, not domain.

## CLI

- `af new [name]` — full project (AeroFortress.toml, src/<App>.Api, Program.cs index, sample module, Modules.cs).
- `af foundations init [--agent-file <path>]...` — initialize the versioned NYA, WTW, RTW, and NWC
  protocols through the framework-pinned binaries.
- `af g module <Name>` — module + `<Name>.ctx.md` + entities placeholder.
- `af g slice <Module> <Name> --verify <id,id>` — slice + co-located test + complete write
  journeys + manifest declaration + exact AVP proof scaffold. The criterion list is mandatory.
- `af g auth` — auth module (Login/Refresh/Register + journeys), Identity entity, session seam.
- `af g hub <Module> <Name>` — SignalR hub at `Modules/<Module>/Realtime/<Name>Hub.cs` (hub is wire: calls the slice, fans out).
- `af doctor` — diagnostic structural check: Roslyn AF* + AeroFortress.toml validation + frontend AFFE*.
- `af gate` / `--affected --base <rev>` — the default done verdict: doctor + universal inventory + the complete
  Git-affected AVP/Assay/Journey/E2E closure. Missing, skipped, focused, mocked-as-real, or selected-but-not-executed
  proofs fail; caller-authored test filters are rejected.
- `af gate --staged --fast` — bounded index-rooted pre-commit feedback; mapped proofs run, while exhaustive
  fallbacks and browser/device execution wait for authoritative CI.
- `af gate --affected --base <rev> --fast` — bounded local pre-push feedback over the commits being sent.
- `af gate --full` — exhaustive release audit over every declared proof.
- `af nya <args...>` — pinned Not You Again CLI for scar recall, collection, specification review,
  recurrence checks, and replay.
- `af wtw <args...>` — pinned Why This Way CLI for governing decisions, invariants, collection,
  explanation, graph health, and final guards.
- `af rtw <args...>` — pinned Right This Way CLI for proven-pattern guidance, recording, and alignment checks.
- `af nwc <args...>` — pinned Now We Can CLI for collecting, waking, resolving, and checking conditional deferments.
- `af test [--unit|--integration|--e2e]` — the .NET test leg, optionally filtered by category.

Typed client generation is an explicit application package script (`npm run gen:client`) over its own OpenAPI and
orval configuration. The four agent-foundation wrappers download verified native releases on first use and
do not turn the framework into a task orchestrator.
