# Skies — Doctor rules (SKY* backend, SKYFE* frontend)

Never suppress. A firing rule means the shape is wrong; fix the shape.

## Backend (Roslyn)

- SKY0001 slice conformance (static class, Input/Output, Handle→Task<Result<T>>, Map, ordered)
- SKY0002 endpoint thin (expression/method group, never statement block)
- SKY0003 every slice has co-located `<Slice>.Tests.cs`
- SKY0004 every module has `<Module>.ctx.md` with non-empty `## Boundaries` + `## Design notes`
- SKY0005 ctx.md fresh: backticked citations resolve in source (not mtime)
- SKY0006 no IRepository / unit-of-work in slices
- SKY0007 file ≤ 500 LOC (Migrations/ exempt)
- SKY0008 every shape-derived write has happy AND sad [Journey] proofs; ambiguity fails closed
- SKY0009 write-ownership: module writes only its own entities (reads/joins free; Tests exempt)
- SKY0010 a [Journey] must cover a shape-derived write slice
- SKY0011 tests live in src/ (tests/<App>.Tests is infra only)
- SKY0012 Map calls `.WithName("<SliceName>")` (operationId = frontend hook name)
- SKY0013 [ValueObject] always-valid (immutable, smart constructor Result<T>)
- SKY0014 [Entity] encapsulation (private ctor/setters, EnsureValid funnel)
- SKY0015 [Module] shape (AddServices + Map)
- SKY0016 every module registered in explicit AddModules/MapModules
- SKY0017 Program.cs is an index (AddSkies/AddPlatform/AddModules + Use/Map only)
- SKY0018 error code is a registry constant on *ErrorCodes (never literal)
- SKY0019 every *ErrorCodes constant is used (no orphans)
- SKY0020 a [Journey] asserts its terminal post-condition; sad also proves unchanged state
- SKY0021 unmarked domain types: DbSet<T> unmarked → [Entity]; complex member of [Entity] unmarked → [ValueObject]
- SKY0022 every endpoint declares authorization (.RequireAuthorization or .AllowAnonymous)
- SKY0023 injected ICurrentUser must be consulted
- SKY0024 raw SQL never absorbs runtime values as text (FromSql/ExecuteSql parameterized)
- SKY0025 held Result<T> checked before .Value/.Error
- SKY0026 every persisted write declares concurrency posture (warning tier)
- SKY0030 every declared criterion has an exact subject-bound [AVP] proof
- SKY0031 every slice declares at least one criterion in its module spec manifest
- SKY0032 backend tests cannot be skipped, conditional, explicit, or not executed
- SKY0033 every write journey is an isolated executable E2E Fact/Theory in *Journey.Tests.cs

Self-harness (framework dev only): SKYSELF001 ≤500 lines · SKYSELF002 no TODO/FIXME/HACK ·
CS1591 public members documented.

## Frontend (eslint-plugin-skies + ts-morph)

- SKYFE001 View purity (no data layer in *.view.tsx; type-only contract imports OK)
- SKYFE002 ViewModel data door (only VMs + lib/session + lib/guards import client.gen)
- SKYFE003 no mocks/MSW outside *.test.*
- SKYFE004 (planned) VM imports no JSX/react-dom
- SKYFE005 every VM has sibling test calling renderHook()
- SKYFE006 every View consuming a VM has sibling render test (import-based detection)
- SKYFE007 (planned) VM exposes loading/error/empty
- SKYFE008 endpoint coverage: every app-facing generated hook referenced by ≥1 data door (tool endpoint-coverage.mjs)
- SKYFE009 VM platform-agnostic (no react-native/expo-*; ports injected)
- SKYFE010 Views route async states through <Resource> (no raw isPending/isError)
- SKYFE011 i18n parity: every locale declares the same flattened keys
- SKYFE012 no inline hex outside token/theme/palette files
- SKYFE013 every mutation surfaces failure (empty onError flagged)
- SKYFE014 no hardcoded user-facing copy in Views (t() only)
- SKYFE015 no imperative redirect in useEffect (declarative <Redirect/>)
- SKYFE016 session one-door: token writes via lib/session seam (+me-cache reset)
- SKYFE017 guards read tri-state SessionState, never raw boolean
- SKYFE018 required route params via requiredParam() union
- SKYFE019 no bare router.back()/history.back() (safeBack/useGoBack)
- SKYFE020 no hardcoded API base URL (env/relative/injected)
- SKYFE021 no dangerouslySetInnerHTML outside audited lib/html seam
- SKYFE022 no open redirect (URL-sourced navigation through in-app allowlist)
- SKYFE023 (planned) no orphan placeholders (// wire later, TODO, @ts-expect-error on data call)
- SKYFE024 (planned, design band) UI door: Views use @/ui kit only (no lowercase JSX/style/className)
- SKYFE025 scale only: no numeric literals in spacing/typography outside ui/tokens/tests
- SKYFE026 (planned, design band) semantic colors only (no rgb/hsl/named/raw palette outside ui/)
- SKYFE027 QueryClient carries mutation defaults (invalidate + feedback; meta.silent/expectedFailure opt-outs)
- SKYFE028 (warn) no onSuccess refetch ritual (defaults already invalidate)
- SKYFE029 refresh one-door (only lib/skies-client, lib/session)
- SKYFE030 no cast on navigation targets
- SKYFE031 submit handles the invalid form path
- SKYFE032 Controller surfaces fieldState validation errors
- SKYFE033 every ViewModel declares `@verify` and has an exact co-located executable Assay proof
- SKYFE034 frontend tests cannot be skipped, focused, todo, or conditionally excluded
- SKYFE035 every ViewModel links distinct subject-bound happy and sad E2E flows

E2E/journey: SKYFE-JOURNEY (back↔front flow parity) · SKYFE-JOURNEY-002 (flow declares terminal
in flows.json and spec asserts it) · SKYFE-E2E-SKIP-IN-GATE-001 (skipped gate-class flow fails CI
gate). A web flow naming `backendSlices` declares `backendContract`, observes real page responses, and asserts
the exact OpenAPI operation ledger after a successful `PW_API_URL` global-setup probe; its spec cannot intercept
requests, invoke API mocks, or call the API directly. Mocked UI smoke cases live in separate front-only specs.
