---
description: End-to-end Skies feature workflow — new slice from backend to wired frontend screen, doctor-clean. Use for "add a feature/endpoint/screen" requests in a Skies app.
---

# Skies feature, end to end

The full path from idea to doctor-clean, wired feature. The primary coding agent owns every
phase and uses the foundation tools directly. Do not create one agent per foundation.

1. **Orient**: run `skies context --task "<goal>" --path <expected-path>` once. Treat governing
   invariants and decisions, due deferments, proven ways, and relevant scars as implementation
   constraints. Rerun only when scope changes or context is compacted.
2. **Scaffold** (skies-scaffolder): choose acceptance criteria with
   `skies criteria suggest <Name>`, then run `skies g slice <Module> <Name> --verify <id,id>` (create
   the module first if needed: `skies g module <Module>`). The CLI refuses a criterion-free slice.
3. **Domain** (skies-backend): model VOs/entity changes (always-valid, EnsureValid funnel),
   implement Handle (validation inline → domain method → SaveChanges → Result), declare error
   codes in the `*ErrorCodes` registry, decide authorization on Map, `.WithName("<Name>")`.
4. **Backend proof** (skies-backend): fill the co-located `<Name>.Tests.cs` and every
   generated `[AVP(typeof(Slice), "criterion")]` proof. For a shape-derived write, complete the
   isolated happy and sad `[Journey]` E2E cases; sad proves rejection and unchanged state. Declare
   the persistence concurrency posture. Never classify the slice by annotation or manifest mode.
5. **Contract**: run the application's `npm run gen:client` — the new hook appears named after the slice.
6. **Frontend** (skies-frontend): create and own the plain triple — ViewModel composes the generated
   hook and exposes loading/error/empty; View renders through `<Resource>`; copy goes to the
   feature's i18n (every locale); error codes get entries in `api-errors`. Enumerate the semantic `@verify` set and
   satisfy every id with its own exact `@avp` + `defineVerification` in the co-located `*.assay.test.*`. Declare
   the needed `@e2e` ids; keep happy/sad as the minimum path floor, and make each `flows.json` entry cite distinct
   `{ id, evidence }` criteria whose evidence its exact case visibly asserts. One criterion belongs to one case;
   cover the complete Assay set without letting happy and sad borrow each other's proof. Target selects the engine
   without a runner field: web uses Playwright specs and native uses Maestro YAML. If a web flow names `backendSlices`, its Playwright case must
   declare `backendContract`, collect page responses with canonical `observeBackend()`, and assert the exact
   operations with `expectBackendSlices()` from `skies-frontend-sdk/playwright-backend`; global setup
   probes `PW_API_URL` with the same package. Put mocked smoke coverage in another spec and never call the API
   directly from a backend-bound case.
7. **Gate**: run `skies check --task "<completed task>"`. Rerun it after every correction.
   Run `skies check --task "<release>" --full` for a release. Any SKY*/SKYFE* finding goes to
   skies-doctor. Fix the shape; never suppress, skip, focus, or weaken the manifest.

Report at the end: slice path, endpoints, error codes, AVP proofs, backend journeys, frontend
happy/sad flows, and all five foundation verdicts.
