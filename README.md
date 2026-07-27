# AeroFortress Framework

An opinionated .NET convention framework — Rails mindset in C#: minimal decision space, plain
stranger-maintainable code, and a "doctor" of Roslyn analyzers that enforce the conventions at build.

- **Slices** — one operation = one `[Slice]` (`Input` / `Output` / `Handle` / `Map`), thin endpoints.
- **Modular monolith** — modules are logical bounded contexts sharing one `AppDb`; a module writes only
  its own entities (AF0009) and references others by id, so a context stays carvable into its own service.
- **The doctor** — the `AF####` analyzers catch structural drift (slice shape, co-located tests, `ctx.md`
  freshness, write-ownership, shape-derived write journeys, registry error codes…) at build time. Full catalog in
  [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).
- **Agent foundations** — every scaffold carries five repository-local protocols: AVP proves declared
  behavior, NYA prevents known failures, WTW preserves governing decisions and invariants, RTW preserves
  proven implementation patterns, and NWC reactivates obligations when their cue becomes true.
- **Generators** — `af new`, `af g module / slice / entity / vo / crud / auth` scaffold exactly the convention.

Two laws hold it together: the output is always **stranger-maintainable** (plain, idiomatic C#), and the harness is
**doctor-removable** — `dotnet remove` the analyzers and the app still compiles and runs; you only lose enforcement.

## Getting started

Install the framework — one meta-package brings the whole runtime **and** the doctor analyzer:

```bash
dotnet add package AeroFortress.Framework
```

A minimal app — `Program.cs` reads as a thin index:

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddAeroFortress();   // slice-aware OpenAPI + enum-as-name JSON
var app = builder.Build();
app.UseAeroFortress();                // serves the typed contract at /openapi/v1.json
app.Run();
```

Install the CLI (a .NET global tool) to scaffold the conventions:

```bash
dotnet tool install -g aerofortress-framework-cli       # the command is `af`
af new MyApp                        # scaffold a project
af g slice Billing CreateInvoice    # a slice + its co-located test
af g auth                           # the auth module (register/login/refresh/logout/me)
af doctor                           # run the conventions over back + front
```

## Agent foundation stack

The framework composes five independent tools instead of merging their data or
responsibilities:

| Foundation | Repository question | Versioned surface | Framework entrypoint |
|---|---|---|---|
| **AVP** | What behavior must this change prove? | `*.spec.toml` and co-located executable proofs | `af criteria`, `af gate` |
| **Not You Again** | Which corrected failure must never recur? | `.nya/scars/`, policy, and skill | `af nya` |
| **Why This Way** | Which decision or invariant governs this change, and why? | `.agent-first/wtw/records/` and skill | `af wtw` |
| **Right This Way** | How does this repository already implement this kind of work? | `.rtw/ways/` and skill | `af rtw` |
| **Now We Can** | Which previously blocked action can proceed now? | `.nwc/deferments/` and skill | `af nwc` |

Every scaffold includes the four versioned stores, portable skills, managed
agent instructions, and pre-commit and pre-push checks. AVP ships as the native
proof protocol. The other four commands resolve pinned release binaries,
verify their embedded SHA-256 checksums, and cache them outside the repository.
No Rust toolchain or global installation is required.

Initialize every shared protocol and then select personal judge configuration
after creating or cloning a project:

```bash
dotnet tool run af foundations init
dotnet tool run af nya setup --judge codex
```

`af foundations init` auto-detects existing `AGENTS.md`, `CLAUDE.md`, and
`GEMINI.md` files. Pass repeated `--agent-file <path>` options to select other
surfaces. Initialization is idempotent and preserves existing content. Each
developer or harness can use a different judge without changing the versioned
team protocol.

Use the foundations throughout a task:

```bash
dotnet tool run af nwc wake
dotnet tool run af wtw explain --task "Add invoice approval" --path "src/Billing/**"
dotnet tool run af rtw guide --task "Add invoice approval" --path "src/Billing/**"
dotnet tool run af nya recall --task "Add invoice approval" --path "src/Billing/**"
dotnet tool run af nya spec --file "specs/invoice-approval.md" --task "Design invoice approval" --path "src/Billing/**"
dotnet tool run af wtw guard --task "Add invoice approval"
dotnet tool run af rtw check --task "Add invoice approval"
dotnet tool run af nya check --task "Add invoice approval"
dotnet tool run af nwc check
dotnet tool run af nya replay --limit 20
```

`af` pins NYA `1.1.0`, WTW `0.1.2`, RTW `0.1.3`, and NWC `0.3.0` for Windows x64, Linux
x64 and ARM64, and macOS x64 and ARM64. Judge commands, credentials,
disposable SQLite indexes, and local configuration remain unversioned.
`af doctor` validates that every shared store, skill, and managed instruction
surface is present and still points through the pinned framework commands.

## Packages (nuget.org)

| Package | What it is |
|---|---|
| **`AeroFortress.Framework`** | the meta — the whole runtime framework + the doctor analyzer (one reference; Rails-omakase) |
| `AeroFortress.Framework.Abstractions` | the spine: `Result<T>`, `Error`, `[Slice]`, `[ValueObject]`, `[Entity]`, `[Module]` |
| `AeroFortress.Framework.AspNetCore` | the ASP.NET wiring: `AddAeroFortress`/`UseAeroFortress`, slice-aware OpenAPI, `Result`→HTTP |
| `AeroFortress.Framework.Auth` / `AeroFortress.Framework.Identity` / `AeroFortress.Framework.Mail` / `AeroFortress.Framework.Sms` / `AeroFortress.Framework.Storage` | the standard ports (no vendor SDK in core — the adapter is the app's choice) |
| `AeroFortress.Framework.Doctor` | the `AF####` Roslyn analyzers (ships with the meta; reference directly for analyzer-only) |
| `AeroFortress.Framework.Testing` / `AeroFortress.Framework.Testing.InMemory` | test helpers — add to a **test** project |
| `aerofortress-framework-cli` | the `af` CLI, as a `dotnet tool` |

The focused packages are à la carte; the `AeroFortress.Framework` meta is the front door. (The harness is removable: drop the
`AeroFortress.Framework.Doctor` analyzer and the app still builds — you only lose the build-time enforcement.)

## Docs

- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — the constitution: the slice shape + the full `AF####` rule catalog.
- [`docs/FRONTEND-CONVENTIONS.md`](docs/FRONTEND-CONVENTIONS.md) — the React Native + web harness (`AFFE*`).
- [`docs/MONOREPO-ARCHITECTURE.md`](docs/MONOREPO-ARCHITECTURE.md) — how the pieces fit.
