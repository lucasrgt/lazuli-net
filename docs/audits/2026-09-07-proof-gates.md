# Proof gate audit — 2026-09-07

The audit covers impact selection, runner invocation, executable evidence, resource bounds, and release
consumption across the .NET CLI, React/TypeScript, Flutter, and Node foundation. Pauta and Hostpoint supplied
real consumer cases. Findings below were corrected and protected by executable regressions before release.

| Finding | Failure before correction | Correction and evidence |
| --- | --- | --- |
| Ambiguous C# dependencies | One Pauta slice selected 412 slice subjects, 1,104 backend filter terms and 223 browser flows. Nested `Input`/`Output`, namespace segments, and property names joined unrelated code. | Resolve top-level qualified types, aliases, extension methods and real consumers. The reproduced edit selects 27 backend filters and no unrelated browser flow. |
| Oversized test filter | A filter longer than 6,000 characters became an unfiltered backend run. | One standard runsettings file retains the full filter. A real runner smoke with over 10,000 characters executes exactly one matching test. |
| Generated-client amplification | Regenerating a client or adding an erased error type widened the application; shared cores widened every surface. | Compare emitted exports and follow actual imports with each package's TypeScript configuration. A real Pauta print-options delta selects its print ViewModel; the inspected Hostpoint core delta selects its email verification ViewModel. |
| Flow contagion and file-wide browser execution | A selected flow added shared features that selected further unrelated flows; one mapped case ran every case in its spec. | Freeze original feature roots and use deduplicated native Playwright test lists across all configured projects. Ambiguous leaf titles require their complete title path. Real runner tests prove an unrelated failing case stays unexecuted. |
| Git uncertainty caused exhaustive work | Missing ancestry widened .NET and Node gates; Node could do so even with fast mode. | Scoped discovery failure starts no proof execution and returns a nonzero verdict. Tests cover staged, explicit-base and default affected modes. |
| Node fast mode lost direct proofs | A path matching both direct proof scopes and force-full scopes lost its direct proofs during deferral. | Preserve direct proof matches and their dependency closure while deferring exhaustive widening. |
| Windows process handling | Native Node arguments passed through cmd.exe; timeout killed only the parent and could leave descendants working or holding pipes. | Native argv bypasses the shell; Windows timeout terminates the process tree. Native argument, timeout and finite descendant-process tests run on Windows. |
| Empty or broken evidence passed | An empty .NET project returned green from a full gate without a TRX; malformed TRX files were ignored; an empty Flutter library passed its full test partition. | Backend runs require executable receipts and reject malformed XML; Flutter libraries require a unit or Assay partition. A real empty-project gate regression now returns exit 2. |
| Native Node scripts ignored affected selection | Appending Vitest arguments preserved the website's original complete Node test-file list. | Execute native Node argv with selected files, two workers, and JUnit evidence. Empty or skipped evidence fails. A real process test contrasts selected and full execution. |
| Excess resource and console output | Independent jobs and workers multiplied process counts; unaffected matrix rows obscured findings; pilot hooks duplicated the design doctor. | Bound doctor/MSBuild/Vitest/Node concurrency, summarize passing and unaffected rows, preserve failures, and let the composed doctor own its design check. |

## Validation

- .NET CLI: 281 tests, compiler warnings promoted to errors.
- Native helper integration and symbol selection: 19 tests, including real Node, Playwright, Git and
  multi-package TypeScript executions.
- Node SDK: lint, build/typecheck, both sample doctors, and 346 unit tests passed on Windows.
- Cross-runtime parity is checked with the repository manifest and its regression suite.
- This framework repository uses PR CI as its authoritative boundary; its local hooks provide bounded feedback.
  Pilots retain their declared authority, including local pre-push where configured. Publishing additionally executes the explicit
  full release workflow for .NET, frontend, Flutter and Node, including the Linux database proof lanes.

The generated import analysis remains conservative when source or configuration cannot be resolved. Unknown
runtime impact widens at the authoritative boundary; unavailable Git scope fails instead. Global compile,
lint and structural proof inventories remain active for scoped runs.

Release units carrying behavior changes are `skies-framework-cli` 4.1.11, `@skiesjs/foundation` 0.1.1 and
`@skiesjs/cli` 0.1.2. Pilot .NET packages align with the CLI's existing framework requirement, 4.1.4.
