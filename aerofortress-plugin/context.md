This project uses **AeroFortress**: an opinionated .NET convention bundle (Rails mindset in .NET) —
vertical slices, marked domain types, a Roslyn/ESLint "doctor" (AF*/AFFE* rules), and an MVVM
frontend harness (React Native + RN-web) wired to the backend via generated typed hooks.

The repository foundation stack is always active:
- **AVP** declares behavior and closes it with executable proofs through `af gate`.
- **NYA** recalls corrected failures with `af nya recall` and blocks recurrences with `af nya check`.
- **RTW** retrieves proven repository patterns with `af rtw guide` and checks final alignment with `af rtw check`.
- **NWC** wakes due conditional work with `af nwc wake` and blocks unresolved obligations with `af nwc check`.

Route through the kit's specialists:
- **aerofortress-scaffolder**: creating anything new — projects, modules, slices, auth, hubs,
  frontend view triples, client generation. Knows every `af` CLI command and what each
  generates. Call it BEFORE hand-writing boilerplate.
- **aerofortress-backend**: domain modeling and slice implementation — entities ([Entity]),
  value objects ([ValueObject]), Result<T>/error registries, module boundaries
  (write-ownership), universal AVP and shape-derived write journeys. The authority on backend
  conventions.
- **aerofortress-frontend**: the MVVM triple (view/viewModel/test + i18n), data doors, generated
  client wiring, session rotation, mandatory loading/error/empty states, design tokens.
- **aerofortress-doctor**: interpreting and fixing `af doctor` output — any AF00xx or AFFExxx
  violation. Give it the exact rule id + file; it knows what each rule enforces and the
  idiomatic fix (never suppress, fix the shape).

Hard rules the orchestrator must respect:
- Never add repository/unit-of-work layers (AF0006). Handlers use AppDb directly.
- One feature = one slice file with Input/Output/Handle/Map. Tests co-located in src/.
- A module writes only its own entities; cross-module references by id, never EF FK.
- Frontend: Views never touch data (AFFE001); only ViewModels import the generated client.
- Every slice declares an acceptance criterion and carries its exact executable `[AVP]` proof.
- Every shape-derived write carries isolated happy and sad `[Journey]` E2E proofs; there is no
  application-selected risk class or lighter test tier.
- Every ViewModel carries its co-located Assay proof and exact happy/sad frontend E2E links. A
  browser flow naming backend slices runs against the real API without request interception.
- Error codes are registry constants, copy lives in i18n — never literals.
- Start work with `af nwc wake`, `af rtw guide`, and `af nya recall` for the task and expected paths.
- A feature is done only when `af gate --affected` is green; `af doctor` or a caller-filtered test command alone is
  diagnostic. The final diff must also pass `af rtw check`, `af nya check`, and `af nwc check`.
  A release additionally requires `af gate --full`.

Deep reference (annotations, CLI, all doctor rules, conventions, decisions) lives in this
plugin's docs — query the network (slug `aerofortress-framework`) before assuming.
