# Monorepo architecture

Skies treats a monorepo as explicit product topology plus independent, ordinary .NET and npm packages.
`Skies.toml` names what exists; it does not define tasks, proof modes, dependencies, generators, or runner
filters. Build behavior stays visible in project files, package scripts, and runner configuration.

## The closed workspace manifest

The active schema is deliberately small:

```toml
[workspace]
name = "hostpoint"

[products.marketplace]
backend = "src/Hostpoint.Api"
core = "clients/app-core"
frontend = "clients/hostpoint-app"

[products.operator]
backend = "src/Hostpoint.Api"
frontend = "clients/hostpoint-os"

[products.web-ui]
library = "clients/web-ui"

[products.public-site]
backend = "src/Hostpoint.Api"
website = "clients/website"

[framework]
repo = "../skies"
```

Only `[workspace]`, `[products.*]`, and the optional `[framework]` section exist. Product topology uses these path
keys:

- `backend`: a .NET application root.
- `core`: a shared frontend application package, or a directory inside its owning npm package. It runs tests and
  Assay but owns no browser/device runner by itself.
- `library`: a shared npm package (UI kit, utilities, adapters). It runs lint, typecheck, and tests; if it later
  gains ViewModels, the same universal Assay obligation applies. It owns no E2E runner by itself.
- `frontend`: an executable application package. It runs tests, Assay, the E2E doctor, and the full E2E runner.
- `website`: an executable public web package with the same proof depth as `frontend`.

Every executable frontend path is a package root with `package.json`. A `core`/`library` path must resolve to an
owning package. Every package listed by the root npm `workspaces` is independently inventoried and must be declared,
even when it has no ViewModel or flow marker yet. Multiple surfaces are separate `[products.*]` sections; there is
no platform array that the gate can silently ignore. A backend, core, or library may be shared by several products.

Unknown sections fail validation. In particular there is no verification setting: code and filesystem inventory
derive every obligation.

## Inventory closes both directions

The manifest selects packages, while the doctor independently expands root npm workspaces and scans package roots
for ViewModels and `e2e/flows.json`. Therefore:

- declaring a package makes its role and proof depth explicit;
- deleting a product entry cannot make an existing proof-bearing package disappear from the gate;
- a core cannot impersonate an executable surface to avoid browser tests;
- one surface cannot lend another surface its runner or flow manifest. Its flow target determines the engine:
  Playwright for web, Maestro for native; the manifest exposes no runner choice.

The workspace feature-E2E leg joins all declared cores and surfaces for the product checkout. Shared hooks are
proved once by a real consumer, while each executable surface still passes its own manifest and runner gate.

## Package ownership

Code stays in normal packages and remains stranger-maintainable:

```text
src/Hostpoint.Api/              ASP.NET application and co-located backend proofs
clients/app-core/               shared ViewModels, Views, generated client, i18n
clients/hostpoint-app/          executable marketplace surface
clients/hostpoint-os/           executable operator surface
clients/website/                executable public site
```

Promote a shared package only when at least two products actually consume it. Platform capability seams are plain
interfaces and adapters owned by the application; the framework does not generate UI behavior or hide a runtime
behind base classes.

## One obligation, two execution scopes

Every gate inventories the complete proof surface. `skies gate --affected` executes the transitive closure rooted in
the Git delta; `skies gate --full` is the exhaustive release audit. Together they enforce:

1. manifest validation, package synchronization, backend analyzers, frontend lint, and typecheck;
2. affected backend tests and subject-bound AVP/Journey proofs, reached transitively through the C# dependency
   graph when a shared type changes (all of them under `--full`);
3. affected non-Assay frontend tests plus direct Assay verification (all packages under `--full`);
4. feature-to-flow coverage across the workspace;
5. global E2E shape/inventory and real Playwright/Maestro execution for affected flows (every flow under `--full`);
6. the traceability matrix printed on every run and persisted as `VERIFICATION.md` and `VERIFICATION.json` only
   by the canonical `--full` audit.

The selector is framework-owned and fail-closed: no product risk flag or caller test filter exists. Shared runtime
or unmapped production changes widen. CLI pins, hooks, and workflows stay in the doctor-validated control plane
and do not widen application proofs merely because the gate itself changed. Pull requests normally require the
affected status; releases require a full verdict. Only an explicitly selected full mode replaces the committed
attestation, even when an uncertain affected run widens its execution for safety.

## Package-first framework updates

Framework rules and shared primitives land in this repository first, are packed as versioned NuGet/npm packages,
and are then consumed by applications. A pilot never keeps a private copy of a framework rule or frontend plugin.
The framework-sync gate detects stale package versions and retired vendored copies.

The canonical backend and frontend conventions remain in [CONVENTIONS.md](CONVENTIONS.md) and
[FRONTEND-CONVENTIONS.md](FRONTEND-CONVENTIONS.md); this document only defines how their proof surfaces compose in
a monorepo.
