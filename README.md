# Skies

<p align="center">
  <a href="https://skies.build">Website</a> |
  <a href="https://github.com/lucasrgt/skies/releases">Releases</a> |
  <a href="docs/CONVENTIONS.md">Conventions</a> |
  <a href="docs/MIGRATING-TO-SKIES.md">Migration</a>
</p>

<p align="center">
  <a href="https://www.nuget.org/packages/Skies.Framework"><img src="https://img.shields.io/nuget/v/Skies.Framework?style=flat-square" alt="NuGet"></a>
  <a href="https://www.npmjs.com/package/skies-frontend-sdk"><img src="https://img.shields.io/npm/v/skies-frontend-sdk?style=flat-square" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
</p>

An opinionated convention framework — the Rails mindset for .NET and Node.js: minimal decision space, plain
stranger-maintainable code, and removable doctors that enforce the conventions at build.

- **Two native backends** — the established .NET framework and the initial plain TypeScript + Express 5 port share
  the same laws without sharing runtime machinery.
- **Slices** — one operation = one visible `Input` / `Output` / `handle` / `map` spine with thin endpoints.
- **Modular monolith** — modules are logical bounded contexts sharing one `AppDb`; a module writes only
  its own entities (SKY0009) and references others by id, so a context stays carvable into its own service.
- **The doctor** — the `SKY####` analyzers catch structural drift (slice shape, co-located tests, `ctx.md`
  freshness, write-ownership, shape-derived write journeys, registry error codes…) at build time. Full catalog in
  [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).
- **Agent foundations** — every scaffold carries five repository-local protocols: AVP proves declared
  behavior, NYA prevents known failures, WTW preserves governing decisions and invariants, RTW preserves
  proven implementation patterns, and NWC reactivates obligations when their cue becomes true.
- **Generators** — `skies new`, `skies g module / slice / entity / vo / crud / auth` scaffold exactly the convention.

Two laws hold it together: the output is always **stranger-maintainable** (plain, idiomatic C#), and the harness is
**doctor-removable** — `dotnet remove` the analyzers and the app still compiles and runs; you only lose enforcement.

## Getting started

Install the framework — one meta-package brings the whole runtime **and** the doctor analyzer:

```bash
dotnet add package Skies.Framework
```

A minimal app — `Program.cs` reads as a thin index:

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSkies();   // slice-aware OpenAPI + enum-as-name JSON
var app = builder.Build();
app.UseSkies();                // serves the typed contract at /openapi/v1.json
app.Run();
```

Install the CLI (a .NET global tool) to scaffold the conventions:

```bash
dotnet tool install -g skies-framework-cli       # the command is `skies`
skies new MyApp                        # scaffold a project
skies g slice Billing CreateInvoice    # a slice + its co-located test
skies g auth                           # the auth module (register/login/refresh/logout/me)
skies doctor                           # run the conventions over back + front
```

### Node.js + Express 5 (initial milestone)

The Node.js implementation lives in the same repository as an independent npm workspace:

```bash
cd node-sdk
npm ci
npm run check
npx skies-node g slice Billing CreateInvoice --method post --route /invoices
```

Its runtime packages are `@skiesjs/core` and `@skiesjs/express`; `@skiesjs/eslint-plugin-node` is the removable
`SKYN####` doctor, and `@skiesjs/cli` ships the non-conflicting `skies-node` generator. See
[`docs/NODE-CONVENTIONS.md`](docs/NODE-CONVENTIONS.md).

## Agent foundation stack

The framework combines its AVP proof gate with Codebase Semantic Memory (CSM).
CSM installs and synchronizes four independent semantic tools while preserving
each standalone contract:

| Foundation | Repository question | Versioned surface | Framework entrypoint |
|---|---|---|---|
| **AVP** | What behavior must this change prove? | `*.spec.toml` and co-located executable proofs | `skies criteria`, `skies gate` |
| **Not You Again** | Which corrected failure must never recur? | `.skies/csm/nya/scars/`, policy, and skill | `skies nya` |
| **Why This Way** | Which decision or invariant governs this change, and why? | `.skies/csm/wtw/records/` and skill | `skies wtw` |
| **Right This Way** | How does this repository already implement this kind of work? | `.skies/csm/rtw/ways/` and skill | `skies rtw` |
| **Now We Can** | Which previously blocked action can proceed now? | `.skies/csm/nwc/deferments/` and skill | `skies nwc` |

The primary coding agent orchestrates all five. Skies does not spawn or require
one specialist agent per foundation:

| Moment | One command | Result |
|---|---|---|
| Task start or scope change | `skies context --task "<goal>" --path <expected-path>` | Bounded decisions, ways, scars, and due work |
| Before commit | `skies check --task "<completed work>" --staged` | AVP plus every semantic gate |
| Committed review or pre-push | `skies check --task "<review>" --base <revision> --fast` | One bounded receipt over the committed delta |
| Release | `skies check --task "<release>" --full` | Exhaustive proof and semantic audit |

Every `skies new` project includes the complete stack: `csm.toml`, the four
stores under `.skies/csm/`, all five protocols, portable skills, managed agent instructions, and
pre-commit and pre-push checks. There is no reduced scaffold and no
per-foundation opt-out. AVP ships as the native proof protocol. The other four
commands run through one pinned CSM release. CSM verifies, caches, and locks the
four native tools outside the repository. No Rust toolchain or global installation
is required.

`.skies/csm` is the Skies scaffold default, not a hard-coded tool path. The
shared `[storage].root` in `csm.toml` may override it for a repository, and every
Skies foundation command and doctor check follows that configured root.

After creating or cloning a Skies project, each developer only selects their
personal judge configuration:

```bash
dotnet tool run skies nya setup --judge codex
```

`skies foundations init` exists for migration, repair, and adoption in an
existing repository. It creates `csm.toml`, safely adopts standalone `.nya/`,
`.wtw/`, `.rtw/`, and `.nwc/` stores, and initializes all four tools together,
auto-detects existing `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` files, and is
idempotent. Pass repeated `--agent-file <path>` options to select other agent
surfaces. `skies foundations sync` updates CSM's exact tool versions and the
single primary-agent workflow. Each developer or harness can use a different judge without changing
the versioned team protocol. The underlying tools remain independently usable
outside Skies; selective installation belongs to those standalone adoption
flows, not to the Skies project template.

The ordinary workflow stays small:

```bash
dotnet tool run skies context --task "Add invoice approval" --path "src/Billing/**"
dotnet tool run skies check --task "Add invoice approval" --staged
```

Use individual commands only for their explicit record lifecycle or deeper maintenance:

```bash
dotnet tool run skies nya spec --file "specs/invoice-approval.md" --task "Design invoice approval" --path "src/Billing/**"
dotnet tool run skies wtw collect
dotnet tool run skies rtw add
dotnet tool run skies nya remember
dotnet tool run skies nwc resolve --id <id> --evidence "<proof>"
dotnet tool run skies nya replay --limit 20
```

`skies` pins CSM `0.1.0`, whose lock currently selects NYA `1.1.6`, WTW `0.1.6`,
RTW `0.1.4`, and NWC `0.3.1` for Windows x64, Linux x64 and ARM64, and macOS
x64 and ARM64. Judge commands, credentials,
disposable SQLite indexes, and local configuration remain unversioned.
`skies doctor` validates that every shared store, skill, and managed instruction
surface is present and still points through the pinned framework commands.

## Packages (nuget.org)

| Package | What it is |
|---|---|
| **`Skies.Framework`** | the meta — the whole runtime framework + the doctor analyzer (one reference; Rails-omakase) |
| `Skies.Framework.Abstractions` | the spine: `Result<T>`, `Error`, `[Slice]`, `[ValueObject]`, `[Entity]`, `[Module]` |
| `Skies.Framework.AspNetCore` | the ASP.NET wiring: `AddSkies`/`UseSkies`, slice-aware OpenAPI, `Result`→HTTP |
| `Skies.Framework.Auth` / `Skies.Framework.Identity` / `Skies.Framework.Mail` / `Skies.Framework.Sms` / `Skies.Framework.Storage` | the standard ports (no vendor SDK in core — the adapter is the app's choice) |
| `Skies.Framework.Doctor` | the `SKY####` Roslyn analyzers (ships with the meta; reference directly for analyzer-only) |
| `Skies.Framework.Testing` / `Skies.Framework.Testing.InMemory` | test helpers — add to a **test** project |
| `skies-framework-cli` | the `skies` CLI, as a `dotnet tool` |

The focused packages are à la carte; the `Skies.Framework` meta is the front door. (The harness is removable: drop the
`Skies.Framework.Doctor` analyzer and the app still builds — you only lose the build-time enforcement.)

## Node.js packages (initial)

| Package | What it is |
|---|---|
| `@skiesjs/core` | HTTP-agnostic `Result<T>` and structured expected errors. |
| `@skiesjs/express` | Explicit Express 5 result-to-HTTP boundary. |
| `@skiesjs/eslint-plugin-node` | The removable `SKYN####` slice doctor. |
| `@skiesjs/cli` | The `skies-node` slice generator. |

These packages start at `0.1.0` while the conventions are proven in a real Node.js pilot.

## Docs

- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — the .NET constitution: the slice shape + the full `SKY####` rule catalog.
- [`docs/NODE-CONVENTIONS.md`](docs/NODE-CONVENTIONS.md) — the TypeScript + Express constitution (`SKYN####`).
- [`docs/NODE-PARITY.md`](docs/NODE-PARITY.md) — the live capability/quality ledger required before Node reaches .NET parity.
- [`docs/FRONTEND-CONVENTIONS.md`](docs/FRONTEND-CONVENTIONS.md) — the React Native + web harness (`SKYFE*`).
- [`docs/MONOREPO-ARCHITECTURE.md`](docs/MONOREPO-ARCHITECTURE.md) — how the pieces fit.
- [`docs/MIGRATING-TO-SKIES.md`](docs/MIGRATING-TO-SKIES.md) — the complete v3 to v4 rename map.
