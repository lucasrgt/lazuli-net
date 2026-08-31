<p align="center">
  <img src="assets/logo.png" alt="Skies albatross engineer mascot" width="400">
</p>

<h1 align="center">Skies</h1>

<p align="center"><strong>Convention over configuration for AI-built .NET, Node.js, and React applications.</strong></p>

<p align="center">
  <a href="#quick-install-with-your-agent">Quick Install</a> |
  <a href="#getting-started">Getting Started</a> |
  <a href="#the-convention-model">Conventions</a> |
  <a href="#the-doctor-and-the-gate">Verification</a> |
  <a href="#architecture">Architecture</a> |
  <a href="https://skies.build">Website</a>
</p>

<p align="center">
  <a href="https://github.com/lucasrgt/skies/actions/workflows/ci.yml"><img src="https://github.com/lucasrgt/skies/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://www.nuget.org/packages/Skies.Framework"><img src="https://img.shields.io/nuget/v/Skies.Framework?style=flat-square&label=.NET" alt="Skies.Framework on NuGet"></a>
  <a href="https://www.npmjs.com/package/@skiesjs/framework"><img src="https://img.shields.io/npm/v/%40skiesjs%2Fframework?style=flat-square&label=Node.js" alt="@skiesjs/framework on npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2EA44F?style=flat-square" alt="MIT License"></a>
</p>

AI coding agents are good at producing locally plausible code. They are less
reliable at preserving a system's architecture, proving unhappy paths, keeping
frontend and backend contracts aligned, and carrying hard-won repository
knowledge through a long task or a different agent.

Skies reduces that decision space. It gives ordinary applications one visible
shape for each operation, generators that begin in that shape, and removable
doctors that reject structural drift. The result is not a new language or a
runtime hidden behind magic. It is plain C#, TypeScript, Express, and React that
a developer who has never heard of Skies can maintain.

Skies applies the Rails mindset — convention over configuration, an omakase
front door, and strong quality control — without importing Rails' runtime
mechanism.

<table>
<tr><td><b>One operation shape</b></td><td>A slice keeps its input, output, handler, transport mapping, contract, and co-located proofs together.</td></tr>
<tr><td><b>Explicit architecture</b></td><td>Modules, routes, dependencies, contracts, and registries remain visible in normal application code. There is no reflection discovery or hidden behavior.</td></tr>
<tr><td><b>Removable enforcement</b></td><td>Roslyn, ESLint, topology doctors, and proof gates enforce the convention without owning runtime behavior.</td></tr>
<tr><td><b>Closed verification</b></td><td>Declared acceptance criteria, tests, journeys, and product flows form one inventory. Missing or unavailable proof cannot become green.</td></tr>
<tr><td><b>Repository-owned context</b></td><td>Decisions, proven ways, corrected failures, and conditional obligations live in Git and are retrieved before editing.</td></tr>
<tr><td><b>Package-first framework</b></td><td>Applications consume versioned NuGet, npm, and Dart packages. Framework rules never hide as private copies inside a pilot.</td></tr>
</table>

The established implementation targets .NET 10 and ASP.NET Core. The Node.js
peer targets Node 24, strict TypeScript, and Express 5 while it advances through
the explicit [parity ledger](docs/NODE-PARITY.md). The frontend convention is
plain React and React Native with a shared, render-agnostic TypeScript core.
Flutter carries the complete frontend contract in idiomatic Dart: pinned
`dart-dio`, `ChangeNotifier` MVVM, the app-owned design vocabulary, all 35
`SKYFL` rules, and real-backend `integration_test` evidence.

---

## Quick install with your agent

Copy this prompt into a coding agent with terminal access:

```text
Set up Skies in this repository.

Read https://github.com/lucasrgt/skies and inspect the existing application
before changing it. Use the native backend that matches the repository:

- .NET 10 / ASP.NET Core: install the latest stable skies-framework-cli as a
  user-local or repository-local dotnet tool, then use the `skies` command.
- Node 24 / TypeScript / Express 5: install the latest stable @skiesjs/cli,
  then use its `skies-node` command.
- Flutter stable: install `skies_flutter` plus the latest stable
  `skies-flutter`, then use its client and feature scaffolders.

For a new application, use the matching `new` generator. For an existing
application, preserve its behavior and migrate incrementally; do not replace
working application code wholesale. Keep all generated runtime behavior plain,
explicit, and doctor-removable.

Read the generated AGENTS.md and the applicable convention documents. Run the
repository's context command before implementation. Run the focused tests while
working, then the staged Skies check. Do not suppress a doctor rule to make the
result green and do not treat skipped, unavailable, or empty proof as passing.

Do not commit, push, or modify unrelated files. Report the selected runtime,
installed versions, generated or changed files, verification commands, and any
remaining action.
```

### Manual installation

For a new .NET application:

```bash
dotnet tool install -g skies-framework-cli
skies new Billing
cd Billing
dotnet restore
dotnet tool run skies context --task "Verify the new application" --path src
dotnet tool run skies doctor
```

The global tool command is `skies`; generated repositories pin their own tool
for repeatable team and CI execution through `dotnet tool run skies`.

For a new Node.js application:

```bash
npm install --global @skiesjs/cli
skies-node new billing-api
cd billing-api
npm install
npm run hooks:install
npm run gate:full
```

The two backends are native peers, not wrappers around one another. Choose the
one that matches the application; both implement the same laws with their own
language's ordinary mechanisms.

---

## Getting started

### .NET and ASP.NET Core

The `Skies.Framework` meta-package is the omakase front door: it brings the
runtime convention and the Roslyn doctor in one reference.

```bash
dotnet add package Skies.Framework
```

The composition root stays a short index:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSkies();
builder.Services.AddPlatform(builder.Configuration);
builder.Services.AddModules(builder.Configuration);

var app = builder.Build();

app.UseSkies();
app.UsePlatform();
app.MapModules();

app.Run();
```

A feature is one static slice. Its handler is HTTP-agnostic; its map is the
thin transport boundary:

```csharp
[Slice]
public static class CreateInvoice
{
    public sealed record Input(Guid CustomerId, decimal Amount);
    public sealed record Output(Guid InvoiceId);

    public static async Task<Result<Output>> Handle(
        Input input,
        AppDb db,
        CancellationToken cancellationToken)
    {
        var amount = Money.From(input.Amount);
        var validation = new Validation()
            .Require(input.CustomerId, "customerId", BillingErrorCodes.CustomerRequired)
            .Collect("amount", amount);

        if (validation.Failed)
            return validation.ToError();

        var invoice = Invoice.Create(input.CustomerId, amount.Value);
        db.Invoices.Add(invoice);
        await db.SaveChangesAsync(cancellationToken);

        return new Output(invoice.Id);
    }

    public static void Map(IEndpointRouteBuilder app) =>
        app.MapPost("/invoices", async (Input input, AppDb db, CancellationToken ct) =>
                (await Handle(input, db, ct)).ToHttp())
            .RequireAuthorization()
            .WithName(nameof(CreateInvoice));
}
```

Generate the standard shapes instead of rebuilding them from memory:

```bash
skies g module Billing
skies g slice Billing CreateInvoice --verify request-idempotency
skies g entity Billing Invoice
skies g vo Money
skies g crud Billing Invoice
skies g auth
skies g hub Billing InvoiceUpdates
skies doctor
```

### Node.js and Express 5

`@skiesjs/framework` is a dependency-only omakase package. Application code
continues to import the focused packages directly; the meta-package exports no
runtime facade and generates no behavior.

```bash
npm install @skiesjs/framework
npm install --save-dev @skiesjs/cli @skiesjs/foundation
```

A Node slice carries an executable Zod/OpenAPI contract beside the same visible
`Input` / `Output` / `handle` / `map` spine:

```ts
export const contract = defineContract({
  operationId: "Billing.CreateInvoice",
  method: "post",
  path: "/invoices",
  auth: "required",
  kind: "app",
  request: { body: z.object({ customerId: z.uuid(), amount: z.number().positive() }) },
  success: { status: 201, output: z.object({ invoiceId: z.uuid() }) },
});

export async function handle(input: Input): Promise<Result<Output>> {
  return Result.ok(await createInvoice(input));
}

export function map(router: Router, openApi: OpenApiRegistry): void {
  mapSlice(router, openApi, contract, { toInput, handle });
}
```

The transactional generator updates the owning module explicitly and refuses
collisions or partial writes:

```bash
skies-node g module Billing
skies-node g slice Billing CreateInvoice --method post --route /invoices
skies-node g value-object Billing InvoiceId
skies-node g crud Billing Invoice
skies-node g auth --issuer billing --audience billing-api
skies-node g hub Billing InvoiceUpdates
```

Drizzle/PostgreSQL, Socket.IO, and test helpers are opt-in satellites. They do
not enter every application through the meta-package.

### React and React Native

The frontend keeps the same locality without inventing a component framework:

```text
features/billing/create-invoice/
  CreateInvoice.view.tsx
  CreateInvoice.viewModel.ts
  CreateInvoice.test.tsx
  create-invoice.i18n.ts
```

The ViewModel is a normal render-agnostic hook. It is the only data door and
composes generated query hooks; the View remains a pure rendering function.
`@skiesjs/react` provides the small shared spine (`AsyncState`, `Resource`,
session, paging, and form helpers), while `@skiesjs/eslint-plugin` enforces the
`SKYFE###` rules.

```bash
npm install @skiesjs/react
npm install --save-dev @skiesjs/eslint-plugin @skiesjs/frontend-sdk
```

The design layer follows the same rule: Skies standardizes semantic token names
and the kit shape, while the application owns token values, components, and
styling technology.

### Flutter

Flutter keeps the generated wire and hand-owned behavior separate:

```text
lib/features/account/wallets/
  wallets_view.dart
  wallets_view_model.dart
test/features/account/wallets/
  wallets_view_test.dart
  wallets_view_model_test.dart
  wallets.assay_test.dart
lib/l10n/features/
  wallets_{pt_BR,en,es}.arb
integration_test/
  wallets_happy_test.dart
  wallets_sad_test.dart
```

`skies-flutter` wraps stock OpenAPI Generator `dart-dio`, projects the
app-client audience, scaffolds the mirrored MVVM unit, and runs the removable
`SKYFL001–035` doctor. The `skies_flutter` Dart package supplies the matching
runtime spine: async composition, session, guards, routing, form and mutation
defaults, localized errors, pagination, injected auth, and the E2E backend ledger.

```bash
npx --yes --package skies-flutter skies-flutter-app .
npm install
flutter pub add skies_flutter
```

`Skies.toml` needs no Flutter-only topology key: a declared frontend package with
`pubspec.yaml` is gated through Flutter analysis, `flutter_test`, `SKYFL`, and
official `integration_test`; React Native keeps its Vitest/Assay/Maestro path.

---

## The convention model

### Two laws

1. **Stranger-maintainable.** Generated and framework-guided output is ordinary,
   idiomatic application code. A developer does not need Skies knowledge to
   read, debug, or extend it.
2. **Doctor-removable.** Remove the analyzers, ESLint plugins, and foundation
   gate and the application still compiles and behaves the same. Only
   enforcement disappears.

These laws exclude hidden source generation of behavior, DSLs, base-controller
runtimes, reflection discovery, generated UI behavior, and framework-owned
business logic.

### One feature, one readable unit

| Concern | .NET | Node.js | React | Flutter |
| --- | --- | --- | --- | --- |
| Contract in/out | nested `Input` / `Output` records | exported `Input` / `Output` plus Zod contract | generated client types plus feature schema | generated `dart-dio` models |
| Behavior | static `Handle` returning `Task<Result<T>>` | `handle` returning `Promise<Result<T>>` | render-agnostic `use…Model` hook | `ChangeNotifier` ViewModel |
| Boundary | thin `Map` using Minimal APIs | thin `map` using Express | thin View consuming one ViewModel | thin Widget consuming one ViewModel |
| Proof | co-located `.Tests.cs`, AVP tests, journeys | sibling `.slice.test.ts`, AVP metadata, journeys | sibling test, Assay verification, product flow | mirrored unit/widget/AVP tests plus real-backend `integration_test` flows |
| Context | one `<Module>.ctx.md` | one `<module>.ctx.md` | feature naming, i18n, and proof metadata | feature naming, ARB, AVP/E2E metadata, and `SKYFL` structure |

The convention favors direct dependencies and rich domain types. Handlers use
the application's `DbContext` or explicit Node dependencies directly; there is
no repository-per-entity or unit-of-work facade. Expected failures travel as a
typed `Result<T>` with stable, namespaced error codes. Modules own their routes,
services, errors, context, and writes.

### Explicit composition

Skies makes registrations and topology boring on purpose:

- `Program.cs` / `app.ts` is a readable index, not a service-registration dump;
- modules are explicitly imported and registered, never discovered by scanning;
- a module writes only its own entities and refers to another module by id;
- HTTP contracts expose domain vocabulary, not client routes or translated copy;
- realtime is opt-in through `skies g hub`, never ambient infrastructure;
- vendor adapters and product rules belong to the application.

### Repository-local context

Every generated application carries AVP plus the four Codebase Semantic Memory
foundations. The primary coding agent operates them as one workflow:

| Foundation | Repository question | Versioned surface |
| --- | --- | --- |
| **AVP** | What behavior must this change prove? | `*.spec.toml` and co-located executable proofs |
| **Not You Again** | Which corrected failure must never recur? | `.skies/csm/nya/scars/` |
| **Why This Way** | Which decision or invariant governs this work, and why? | `.skies/csm/wtw/records/` |
| **Right This Way** | How is this kind of work already implemented correctly here? | `.skies/csm/rtw/ways/` |
| **Now We Can** | Which previously blocked action can proceed now? | `.skies/csm/nwc/deferments/` |

The stores are readable, versioned team knowledge. Personal judge settings,
credentials, caches, and SQLite indexes remain local and unversioned.

---

## The doctor and the gate

The doctor turns the written convention into a build contract:

| Band | Surface | Examples |
| --- | --- | --- |
| `SKY####` | .NET Roslyn analyzers | slice shape, tests, module context, direct data access, write ownership, auth posture, error registries |
| `SKYN####` | Node ESLint and topology doctor | slice contracts, explicit registration, tests, journeys, auth, errors, repository shape |
| `SKYFE###` | React/TypeScript ESLint and workspace tools | View/ViewModel separation, async states, contract use, i18n, accessibility, design tokens, product flows |
| `SKYFL###` | Flutter architecture, design, and proof doctor | 1:1 semantic slots with `SKYFE001–035`, expressed through Dart, Widgets, ARB, and `integration_test` |
| `SKYSELF###` | framework development only | public documentation, file size, source hygiene; never shipped to applications |

The gate closes proof around that structure. It inventories the complete
workspace, maps the selected Git delta to its transitive proof closure, and
emits an honest verification matrix.

| Moment | Command | Result |
| --- | --- | --- |
| Task start or scope change | `skies context --task "<goal>" --path <expected-path>` | Bounded decisions, ways, scars, and due work |
| Before commit | `skies check --task "<completed work>" --staged` | AVP and every semantic gate over the staged change |
| Committed review or pre-push | `skies check --task "<review>" --base <target> --fast` | Bounded review over `base...HEAD` |
| Pull request CI | `skies check --task "<review>" --base <target>` | Authoritative affected verification |
| Release | `skies check --task "<release>" --full` | Exhaustive workspace proof |

Exit code `0` means every selected leg held. Exit code `1` means findings
remain. Exit code `2` or greater means validation was incomplete. Skies does
not translate a missing runner, malformed manifest, skipped proof, or empty
receipt into success.

`skies doctor`, focused tests, linters, and individual foundation commands are
useful during implementation; none replaces the scoped `skies check` receipt.

---

## Packages

### NuGet

| Package | Purpose |
| --- | --- |
| **`Skies.Framework`** | Omakase front door: runtime framework plus the removable doctor analyzer |
| `Skies.Framework.Abstractions` | `Result<T>`, `Error`, `Validation`, `Page<T>`, and marker attributes |
| `Skies.Framework.AspNetCore` | `AddSkies`, `UseSkies`, slice-aware OpenAPI, and `Result` to HTTP mapping |
| `Skies.Framework.EntityFrameworkCore` | Ordered, bounded EF Core pagination |
| `Skies.Framework.Auth` | Typed current-user and refresh-cookie conventions |
| `Skies.Framework.Identity`, `.Mail`, `.Sms`, `.Storage` | Provider-independent ports; adapters remain application-owned |
| `Skies.Framework.Testing`, `.Testing.InMemory`, `.Testing.Postgres` | Test hosts and integration-proof helpers |
| `Skies.Framework.Doctor` | Shipped `SKY####` analyzers; reference directly for analyzer-only use |
| `skies-framework-cli` | The `skies` project and feature generator |

### npm

| Package | Purpose |
| --- | --- |
| **`@skiesjs/framework`** | Dependency-only Node runtime and doctor omakase bundle |
| `@skiesjs/core`, `@skiesjs/openapi`, `@skiesjs/express` | Results, validation, contracts, OpenAPI, and the Express boundary |
| `@skiesjs/auth`, `@skiesjs/auth-express` | Portable auth primitives and explicit Express adapters |
| `@skiesjs/storage`, `@skiesjs/storage-express` | Streamed storage and the HTTP boundary |
| `@skiesjs/drizzle-postgres` | Tenant policy, paging, versioned writes, and audited raw SQL |
| `@skiesjs/socketio` | Opt-in authenticated realtime contracts |
| `@skiesjs/testing`, `@skiesjs/testing-postgres` | Proof vocabulary, real hosts, and PostgreSQL integration |
| `@skiesjs/eslint-plugin-node`, `@skiesjs/doctor`, `@skiesjs/foundation` | Removable Node enforcement and proof gates |
| `@skiesjs/cli` | The transactional `skies-node` generator |
| `@skiesjs/react`, `@skiesjs/eslint-plugin`, `@skiesjs/frontend-sdk` | Frontend spine, `SKYFE###` rules, and workspace doctors |
| `skies-flutter` | Pinned `dart-dio`, MVVM/design scaffolds, full-stack doctors, and executable Flutter↔React parity manifest |

### pub.dev

| Package | Purpose |
| --- | --- |
| `skies_flutter` | Async/session/routing/form/mutation/paging spine, typed Dio failures/auth, and test-only backend journey ledger |

Use the meta-packages as the front doors and focused packages when the
application needs an à-la-carte dependency graph.

---

## Architecture

```text
src/                         .NET runtime packages and CLI
analyzers/
  Skies.Framework.Doctor/    shipped SKY#### analyzer
  Skies.Framework.SelfHarness/ framework-development-only SKYSELF#### analyzer
node-sdk/
  packages/                  Node runtime, doctor, foundation, and CLI packages
  examples/                  minimal sample and proof-bearing pilot
frontend-sdk/
  packages/skies-react/      render-agnostic React spine
  packages/eslint-plugin/    SKYFE### rules
  tools/                     workspace and product-flow doctors
flutter-sdk/
  packages/skies_flutter/    Flutter runtime spine and integration-test ledger
  tools/                     dart-dio, MVVM/design scaffolds, SKYFL and full-stack gates
  parity/                    executable Flutter↔React capability contract
examples/sample-app/         canonical .NET backend and frontend
templates/skies-app/         source for `skies new`
parity/                      cross-runtime capability contract
docs/                        constitutions, architecture, and migration guides
```

The runtime and enforcement dependency directions stay one-way: application
code uses normal packages; doctors inspect it but do not provide behavior;
framework-development checks never enter published artifacts. The
[monorepo architecture](docs/MONOREPO-ARCHITECTURE.md) defines package
ownership, proof inventory, and the package-first release path.

---

## Scope

Skies ships conventions, focused primitives, generators, and enforcement that
are generic across applications and proven by real use.

It deliberately does not ship:

- source-generated behavior, a proprietary language, or a runtime applications
  must inherit from;
- reflection-based module or route discovery;
- vendor-specific adapters in core packages;
- business rules that belong to one product;
- generated frontend behavior or a styling-system runtime;
- realtime infrastructure unless an application explicitly generates it;
- abstractions whose only purpose is to hide ordinary framework code.

Removing the doctors must always leave a compiling, running, understandable
application. A proposal that breaks that property is outside the framework.

---

## Documentation

- [.NET conventions and complete `SKY####` catalog](docs/CONVENTIONS.md)
- [Node.js conventions and `SKYN####` catalog](docs/NODE-CONVENTIONS.md)
- [Node.js parity ledger](docs/NODE-PARITY.md)
- [Frontend conventions and `SKYFE###` catalog](docs/FRONTEND-CONVENTIONS.md)
- [Flutter conventions and `SKYFL###` structural band](docs/FLUTTER-CONVENTIONS.md)
- [Design conventions and token/kit contract](docs/DESIGN-CONVENTIONS.md)
- [Monorepo architecture](docs/MONOREPO-ARCHITECTURE.md)
- [Migration to Skies 4](docs/MIGRATING-TO-SKIES.md)
- [.NET sample application](examples/sample-app/)
- [Node.js package guide](node-sdk/README.md)

---

## Build and contribute

Requirements: .NET 10 SDK, Node.js 24, npm, Flutter stable, Java 21 for OpenAPI
Generator, and Docker for the PostgreSQL integration proofs.

```bash
dotnet build Skies.Framework.slnx
dotnet test Skies.Framework.slnx

npm --prefix frontend-sdk ci
npm --prefix frontend-sdk run check

npm --prefix flutter-sdk ci
npm --prefix flutter-sdk run check

npm --prefix node-sdk ci
npm --prefix node-sdk run check
npm --prefix node-sdk run test:integration
npm --prefix node-sdk run package-smoke

npm run test:parity
npm run check:parity -- --ci
```

The repository's own self-harness treats missing public XML documentation,
oversized framework files, and materialized agent notes as build failures. Fix
the code or documentation; do not suppress the rule.

---

## License

[MIT](LICENSE) © 2026 Lucas Tinoco.
