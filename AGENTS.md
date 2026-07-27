# Skies (.NET) — Operating manual for AI agents

Skies is the **opinionated .NET convention bundle**: a standardized vertical-slice
architecture + a build-time harness (the doctor) + an ai-context discipline, so an LLM has
less to decide and what it writes is enforced. It is the **Rails mindset in .NET** — the
mentality (convention over configuration, quality control, semantic density), **not** the
mechanism (no runtime metaprogramming, no language). Reference codebase: `rails/rails`.

> This is **not** the Skies language (the Rust project — parked). Same name, same soul
> (semantic density for the AI + CoC), different body: plain, idiomatic .NET.

Mirrored verbatim at `AGENTS.md` for tooling that loads it (Codex, Aider, etc.).

---

## The two laws (never violate)

1. **Stranger-maintainable.** The output is always plain, idiomatic C# that a .NET dev who
   has never heard of Skies can read and maintain.
2. **Doctor-removable.** `dotnet remove` the analyzers and the project still **compiles and
   runs** — you only lose enforcement. The harness is wire, not apparatus.

Any feature that fails both — hidden source-gen of behavior, a DSL, a runtime you inherit
from, magic discovery — is **out, by construction**.

The goal is **not "less code"**. It is **semantic density**: more meaning per token for the
AI (rich types, standardized shapes, co-located context). Token savings follow; they are not
the target.

---

## Repository layout

```
src/Skies.Framework.Abstractions/      The thin wire: Result<T>, Error, Validation, [Slice], [ValueObject], [Entity]. A normal dependency.
src/Skies.Framework.AspNetCore/        The HTTP boundary: ToHttp, ErrorBody, AddSkies/UseSkies, slice-aware OpenAPI.
src/Skies.Framework.Auth/ + others     The optional component standards (auth, mail, sms, storage, testing) — each a small package.
src/Skies.Framework.Cli/               `skies` — scaffolders (module/slice/entity/vo/…) that emit doctor-conformant code.
analyzers/Skies.Framework.Doctor/      SHIPPED harness. SKY* rules + the CA* security-floor globalconfig — run on the USER's code.
analyzers/Skies.Framework.SelfHarness/ FRAMEWORK-DEV ONLY. SKYSELF* rules — run on OUR code. Never shipped.
frontend-sdk/                 The front half: skies-react (the spine), eslint-plugin-skies (SKYFE* rules), tools/ (doctors).
examples/sample-app/          The reference app + canonical slice (backend/Sample.Api, Sample.Tests, frontend/).
templates/skies-app/         The `skies new` starter the CLI scaffolds from.
build/Skies.Framework.Library.props    The library standard, declared once.
docs/CONVENTIONS.md           The backend constitution + slice shape + full SKY* rule catalog.
docs/FRONTEND-CONVENTIONS.md  The frontend constitution + MVVM shape + full SKYFE* rule catalog.
docs/DESIGN-CONVENTIONS.md    The design constitution: token taxonomy + closed kit shape + the SKYFE design band.
```

Ground every convention fact in `docs/CONVENTIONS.md` / `docs/FRONTEND-CONVENTIONS.md` /
`docs/DESIGN-CONVENTIONS.md`, never memory.

---

## The bar for code you write here

Every `Skies.Framework.*` library file is held to the self-harness. Write to it from the start:

- **File at or under 500 lines.** Past it, extract a concern — do not pack (`SKYSELF001`).
- **Gold-standard XML docs on every public member.** Missing docs are a build error
  (`CS1591`). Lead with *why*, not *what*; use `<inheritdoc/>` on overrides.
- **No junk comments.** No `TODO`/`FIXME`/`HACK`/`XXX`, no tracking codes (`WAR-001`,
  `SPEC-001`), no materialized AI thoughts (`SKYSELF002`). Only documentation worth reading.
- **Tests with intent**, not `1 + 1 == 2`. A test states a behavior the code must keep.

If the build fails on `SKYSELF*`/`CS1591`, **fix the code — never suppress the rule.** The
target is source a Microsoft .NET MVP would read and be proud of.

---

## Build & verify — green before you are done

```
dotnet build Skies.Framework.slnx     # the doctor + self-harness run inside the build
dotnet test  Skies.Framework.slnx     # the slice tests
```

A green build means the conventions are held. Never leave the workspace red.

---

## The doctor vs the self-harness — keep them separate

- **`SKY*` (`Skies.Framework.Doctor`)** — rules on the **user's** code. Shipped. Enforces the slice
  convention (e.g. `SKY0001`: a `[Slice]` is a static class with a nested `Input` and `Output`, a
  `Handle` returning `Task<Result<T>>`, and a `Map`).
- **`SKYSELF*` (`Skies.Framework.SelfHarness`)** — rules on **our own** code. `IsPackable=false`,
  referenced with `ReferenceOutputAssembly="false"`. **Never packaged, never in the
  production CLI or the published `Skies.Framework.Doctor`.** This is the `skies` vs `skies-dev`
  split: framework-dev tooling stays out of the published surface, always.

New framework-dev tooling never lands on the published surface.

---

## Scope discipline — the anti-drift guardrails

The two cautionary tales are concrete. **The predecessor language** died from owning a compiler
(gargantuan apparatus, generated non-code, zero adoption). **Aerocoding** died from scope
explosion (a generator that metastasized into a full-SaaS meta-framework + frontend sprawl +
28K LOC of specs for unbuilt features). Do not repeat either:

- **No source-gen of behavior.** Plumbing only, if ever — and not yet. A source generator is
  a mini-compiler: the source-gen vector. Behavior always stays visible in the slice.
- **No vendor adapters in core.** Ship the *standard* a component follows, not the plugins.
- **No source-gen of UI behavior, no realtime *on by default*, no multi-app sprawl.** The
  aerocoding failure modes — designed out. *Nuance (so this never reads as a ban):* the frontend
  is written once, owned by the app, and enforced, never re-generated; real-time is **opt-in**
  via `skies g hub` (CONVENTIONS.md §"Real-time — hubs"). The failure mode is the sprawl/source-gen,
  not the capability.
- **No runtime framework you inherit from.** Conventions + analyzers, not base classes.
- **`[Slice]` stays a pure marker; `.ctx.md` stays prose.** Reject fattening either into a
  mini-language.

When a proposal smells like *capability* instead of *convention + enforcement*, it is a scope
violation. Reject in line — do not defer it to a checklist.

---

## The package-first law — how a change reaches the pilots

The pilots consume this framework **only as versioned NuGet/npm packages — never as source copies, and never
the other way around**. Framework-shaped code
(a rule, a primitive, a converter, a harness mechanism) lands HERE first; a pilot prototyping one inline
is the failure mode that buried half this framework inside hostpoint for months. The release loop:

1. Implement + test here. Bump `<Version>` in `build/Skies.Framework.Library.props` when the wave is meaningful.
2. `dotnet pack Skies.Framework.slnx -c Release -o local-feed` — the pilots' `nuget.config` fronts nuget.org with
   this feed. **Re-packing the same version requires purging the consumer cache**
   (`rm -rf ~/.nuget/packages/<package>/<version>`) or the pilot keeps restoring the stale bits.
3. In each pilot: bump the `Skies*`, `eslint-plugin-skies`, and `skies-react` package
   versions, refresh the lockfiles, and fix what the new doctors reveal. The fallout IS the feature.

Enforcement, not memory: `skies doctor` carries a **framework-sync leg** (`src/Skies.Framework.Cli/FrameworkSync.cs`)
that fails a pilot on stale backend/frontend package versions or a retired in-repo frontend copy when the checkout
declared in its `Skies.toml` `[framework] repo` is reachable; lint chains may delegate the same package check
to `frontend-sdk/tools/framework-sync.mjs`. When a pilot legitimately discovers
a framework gap mid-feature, the order is: fix it here, repack, re-restore — the same loop, just inner.
`docs/PORTBACK-CHECKLIST.md` tracks anything that historically leaked the wrong way.

---

## Git discipline

- Stage specific files (`git add <path>`), never `-A`/`.`.
- One commit per concern; lowercase, present-tense imperative messages.
- Workspace green every commit (`dotnet build` + `dotnet test`).
- No `--force`, no history rewrites to escape a failing hook — fix forward.

<!-- skies:foundations:start -->
## Skies foundation workflow

The primary coding agent owns the complete foundation lifecycle. Never create or
delegate one agent per foundation.

1. At task start, run `dotnet tool run skies context --task "<goal>" --path <expected-path>`.
   Treat every returned decision, invariant, way, scar, and due deferment as governing context.
2. Rerun `dotnet tool run skies context` after scope changes, context compaction, or movement into
   an unfamiliar area. Keep retrieval bounded with accurate task text and paths.
3. Use the repository-local foundation skills only when a real lifecycle event occurs: accepted
   decisions for WTW, proven patterns for RTW, corrected failures for NYA, or evidence-backed
   conditional deferments for NWC. Never record hypothetical guidance.
4. Run the repository's ordinary tests and linters during implementation.
5. Before commit or completion, run `dotnet tool run skies check --task "<completed work>"`.
   For committed review or pre-push review, add `--base <target-revision>`. For a release, use `--full`.
6. Rerun the same check after every fix. Exit code 1 means findings remain. Exit code 2 or greater
   means validation was incomplete. Neither is a pass.

Tests, linters, review, and individual foundation commands do not replace `skies check`.
<!-- skies:foundations:end -->
