# Skies — Key decisions (ADR digest)

- **Frontend harness**: MVVM over plain custom hooks (no classes/observables/two-way binding);
  orval stock wrapped, never a bespoke compiler; typed slice-hooks via OpenAPI so completeness
  is enforced by tsc, not lint; ViewModels scaffolded once then owned (no source-gen of
  behavior); the ESLint plugin is optional and doctor-removable. The "wired" guarantee is the
  type system: an invented endpoint is a compile error.

- **Journey depth enforcement**: Tier A — linked flows declare `terminal` in flows.json and the
  spec asserts it after entry (entry-only flagged); skipped gate-class flows fail the CI gate.
  Tier B — every write's `[Journey]` bodies must assert post-conditions (SKY0020), while every
  visible feature independently links exact happy/sad browser flows and every consumed backend slice appears in
  one journey owned by an actual consumer (shared slices are proved once). Backend-bound web cases run against
  the real API without request interception. Runtime
  mutation depth may be layered later, but never replaces the release gate. Honest ceiling:
  semantic adequacy of an assertion is undecidable by analyzer.

- **No application-selected proof class**: all slices owe acceptance verification; code shape
  derives whether the stronger write journey pair applies, and ambiguity fails closed as write.
  Classification attributes and manifest modes were removed because they let an implementing agent
  choose the smaller obligation. Proof requirements now arise from inventories the gate computes.

- **Unmarked domain type (SKY0021)**: catch the UNMARKED entity/VO, not just police the marked —
  `DbSet<T>` with unmarked T requires `[Entity]`; complex members of entities require
  `[ValueObject]`. Omission of the mark was the evasion (a pilot shipped an anemic `User`);
  marks become the only way to model state.

- **Monorepo architecture**: ordinary backend, core, library, and executable frontend packages, each named
  explicitly in `[products.*]`. Root npm workspaces are independently inventoried, so an unmarked shared package
  cannot fall outside the gate. Multiple surfaces use multiple product sections; there is no platform array.
  `Skies.toml` is topology-only and doctor-validated.

- **Core mission**: scaffolding + the doctor + AI-context discipline (ctx.md). The framework is
  the skeleton and its enforcement — apps bring their own libraries and business logic; vendors
  and integrations live in plugins, not in the framework.
