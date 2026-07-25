# AeroFortress Framework

An opinionated .NET convention framework — Rails mindset in C#: minimal decision space, plain
stranger-maintainable code, and a "doctor" of Roslyn analyzers that enforce the conventions at build.

- **Slices** — one operation = one `[Slice]` (`Input` / `Output` / `Handle` / `Map`), thin endpoints.
- **Modular monolith** — modules are logical bounded contexts sharing one `AppDb`; a module writes only
  its own entities (AF0009) and references others by id, so a context stays carvable into its own service.
- **The doctor** — the `AF####` analyzers catch structural drift (slice shape, co-located tests, `ctx.md`
  freshness, write-ownership, shape-derived write journeys, registry error codes…) at build time. Full catalog in
  [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).
- **Not You Again** — every scaffolded repository carries a versioned scar store and the `recall → remember →
  check` agent protocol. The project-pinned `af nya` command downloads one verified native binary on first use.
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

Every scaffold includes `.nya/`, managed agent instructions, and recurrence
checks in the local pre-commit and pre-push hooks. No Rust toolchain or global
NYA install is required:

```bash
dotnet tool run af nya setup --judge codex
dotnet tool run af nya recall --task "Add invoice approval" --path "src/Billing/**"
dotnet tool run af nya check --task "Add invoice approval"
```

`af` pins NYA `1.0.6`, selects the native release for Windows, Linux, or macOS,
verifies its embedded SHA-256, and caches it outside the repository. Judge and
credential selection remains personal in the user config, with
`.nya/config.local.toml` available as an unversioned repository override.
Scars, policy, and the skill remain versioned for the team.

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
