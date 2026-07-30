This project uses **Skies**: an opinionated .NET convention bundle (Rails mindset in .NET) —
vertical slices, marked domain types, a Roslyn/ESLint "doctor" (SKY*/SKYFE* rules), and an MVVM
frontend harness (React Native + RN-web) wired to the backend via generated typed hooks.

The repository foundation stack is always active:
- **AVP** declares behavior and closes it with executable proofs through `skies gate`.
- **NYA** recalls corrected failures with `skies nya recall` and blocks recurrences with `skies nya check`.
- **WTW** retrieves governing decisions and invariants with `skies wtw explain` and validates them with `skies wtw guard`.
- **RTW** retrieves proven repository patterns with `skies rtw guide` and checks final alignment with `skies rtw check`.
- **NWC** wakes due conditional work with `skies nwc wake` and blocks unresolved obligations with `skies nwc check`.

The primary coding agent owns the full lifecycle. It runs `skies context` once to compose
bounded repository context and `skies check` once to compose the final verdict. Never
create or delegate one agent per foundation.

The kit's specialist documents are reference profiles, not required delegates:
- **skies-scaffolder**: creating anything new — projects, modules, slices, auth, hubs,
  frontend view triples, client generation. Knows every `skies` CLI command and what each
  generates. Call it BEFORE hand-writing boilerplate.
- **skies-backend**: domain modeling and slice implementation — entities ([Entity]),
  value objects ([ValueObject]), Result<T>/error registries, module boundaries
  (write-ownership), universal AVP and shape-derived write journeys. The authority on backend
  conventions.
- **skies-frontend**: the MVVM triple (view/viewModel/test + i18n), data doors, generated
  client wiring, session rotation, mandatory loading/error/empty states, design tokens.
- **skies-doctor**: interpreting and fixing `skies doctor` output — any SKY00xx or SKYFExxx
  violation. Give it the exact rule id + file; it knows what each rule enforces and the
  idiomatic fix (never suppress, fix the shape).

Hard rules the orchestrator must respect:
- Never add repository/unit-of-work layers (SKY0006). Handlers use AppDb directly.
- One feature = one slice file with Input/Output/Handle/Map. Tests co-located in src/.
- A module writes only its own entities; cross-module references by id, never EF FK.
- Frontend: Views never touch data (SKYFE001); only ViewModels import the generated client.
- Every slice declares an acceptance criterion and carries its exact executable `[AVP]` proof.
- Every shape-derived write carries isolated happy and sad `[Journey]` E2E proofs; there is no
  application-selected risk class or lighter test tier.
- Every ViewModel carries its co-located Assay proof and exact happy/sad frontend E2E links. A
  browser flow naming backend slices runs against the real API without request interception.
- Error codes are registry constants, copy lives in i18n — never literals.
- Start work with `skies context --task "<goal>" --path <expected-path>`.
- Before commit, stage the intended paths and require
  `skies check --task "<completed work>" --staged` to be green; `skies doctor` or a
  caller-filtered test command alone is diagnostic. Pull-request CI owns the authoritative
  affected check without `--fast`; release automation requires
  `skies check --task "<release>" --full`.

Deep reference (annotations, CLI, all doctor rules, conventions, decisions) lives in this
plugin's docs — query the network (slug `skies`) before assuming.
