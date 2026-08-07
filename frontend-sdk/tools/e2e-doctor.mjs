#!/usr/bin/env node
// The e2e tier of the frontend doctor (canonical and target-derived). A project declares journeys in
// `e2e/flows.json`, and this doctor proves every listed journey has an enabled implementation file, a terminal
// assertion, and a runner for its target. `feature-e2e-coverage.mjs` closes the inverse direction: every ViewModel
// links a flow, and every backend slice consumed by the UI is named by a linked journey.
// The manifest itself is mandatory: absence and an empty list are coverage gaps, never bootstrap green.
//
// SINGLE TIER, by design: being in `flows.json` IS the bar — there are no skipped/ephemeral sub-tiers. A listed
// flow with no executable spec is a blocking gap, not a backlog item dressed as coverage.
//
// A flow declares its `target` (web|native), which selects its runner without another decision: Playwright for WEB
// and Maestro for NATIVE. Its `spec` therefore has the matching visible form (`.spec.ts` / `.yaml`).
// `checkE2e(root)` is pure (no process.exit) so a CLI, a test, or `skies doctor` decides what to do with it.
//
// DEPTH, not just existence (SKYFE-JOURNEY-002). A spec existing does NOT mean the journey is covered — a spec can
// stop at the door (assert the entry screen and return), punting the rest to the backend twin. That is the exact
// shape that let a pilot's onboarding ship a "complete -> back to step 0" bug under a green doctor. So a LINKED flow
// flow must also declare `terminal`: the marker — a testID or route — its spec asserts
// AFTER entry to prove the journey reached its end. The doctor reads the spec and flags it when the terminal is
// undeclared or never referenced. These are reported as `depthGaps` (warn-tier), kept SEPARATE from the hard
// existence `gaps`; both are blocking because a journey that only reaches its door is not an E2E proof.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Canonical runners are derived from the target. Alternative configs are detected separately and rejected so one
// surface cannot maintain a second, weaker execution path beside its release proof.
const RUNNER_DETECT = {
  playwright: { files: ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs"], dirs: [] },
};
const NONCANONICAL_RUNNER_DETECT = {
  cypress: { files: ["cypress.config.ts", "cypress.config.js", "cypress.config.mjs", "cypress.config.cjs"] },
  detox: { files: [".detoxrc.js", ".detoxrc.json", ".detoxrc"] },
};
const FLOW_KEYS = new Set([
  "area", "backendContract", "backendOutcome", "backendSlices", "case", "criteria", "features", "id", "name",
  "path", "spec", "target", "terminal",
]);

/** The e2e runners a project has configured (e.g. ["playwright", "maestro"]). */
export function detectRunners(root) {
  const configured = Object.entries(RUNNER_DETECT)
    .filter(([, { files, dirs }]) => files.some((f) => existsSync(join(root, f))) || dirs.some((d) => existsSync(join(root, d))))
    .map(([name]) => name);
  if (hasCompleteMaestroScript(root)) configured.push("maestro");
  return configured;
}

function hasCompleteMaestroScript(root) {
  try {
    const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const command = packageJson?.scripts?.["test:e2e"];
    return typeof command === "string"
      && /(?:^|&&\s*)maestro\s+test\s+(?:\.?[\\/]?e2e|\.?[\\/]?maestro)\s*(?=$|&&)/i.test(command);
  } catch {
    return false;
  }
}

function detectNoncanonicalRunners(root) {
  return Object.entries(NONCANONICAL_RUNNER_DETECT)
    .filter(([, { files }]) => files.some((file) => existsSync(join(root, file))))
    .map(([name]) => name);
}

/**
 * Classify what an existing spec actually exercises. Presence alone is not execution coverage:
 * `ci-gated` specs require a real backend, `seed-pending` specs still await deterministic seed data,
 * `front-only` specs are browser/render smoke, and YAML specs are native.
 */
export function classifySpec(root, spec) {
  if (/\.ya?ml$/i.test(spec)) return "native";
  try {
    const source = readFileSync(join(root, spec), "utf8");
    return classifySource(spec, source);
  } catch {
    return "missing";
  }
}

function classifySource(spec, source) {
  if (/\.ya?ml$/i.test(spec)) return "native";
  const executable = stripComments(source);
  if (hasNonExecutingTest(executable)) return "disabled";
  if (/\brequireSeed\s*\(/.test(source)) return "seed-pending";
  if (hasBackendObservation(executable) && importsCanonicalBackendProof(executable)) return "ci-gated";
  return "front-only";
}

/**
 * Inspect a project's e2e tier. Returns
 * `{ runners, flows, gaps, depthGaps, execution, seedPending, messages }`:
 *   - runners: detected runners; flows: count of curated journeys; gaps: hard existence problems; messages: lines
 *   - depthGaps: blocking journey-depth findings (SKYFE-JOURNEY-002) — a flow with no `terminal`, or a spec
 *     that never asserts its declared `terminal`.
 * Each flow: `{ id, name, path, area?, target, spec, case?, backendSlices?, backendContract?, backendOutcome?, terminal }` where `id` is the stable
 * ViewModel linkage key, `path` is happy|sad, `spec` is relative to root, and optional `case` names one test in a
 * shared spec. `terminal` is the testID/route the proof asserts after entry.
 * Target-derived: a target:native flow needs Maestro; a target:web flow needs Playwright.
 */
export function checkE2e(root) {
  const emptyExecution = { "ci-gated": 0, "front-only": 0, "seed-pending": 0, disabled: 0, native: 0 };
  const flowsFile = join(root, "e2e", "flows.json");
  if (!existsSync(flowsFile)) {
    return {
      runners: detectRunners(root),
      flows: 0,
      gaps: 1,
      depthGaps: 0,
      execution: emptyExecution,
      seedPending: [],
      messages: ["no e2e/flows.json — every user-visible feature needs a curated E2E flow"],
    };
  }

  const messages = [];
  let gaps = 0;
  let depthGaps = 0;
  const execution = { ...emptyExecution };
  const seedPending = [];
  const runners = detectRunners(root);
  const noncanonicalRunners = detectNoncanonicalRunners(root);
  const hasWeb = runners.includes("playwright");
  const hasNative = runners.includes("maestro");
  if (runners.length === 0) {
    messages.push("no canonical e2e runner configured (target:web requires playwright.config.*; target:native requires `maestro test e2e`)");
    gaps++;
  }
  for (const runner of noncanonicalRunners) {
    messages.push(`noncanonical ${runner} configuration is present; target:web uses Playwright and target:native uses Maestro`);
    gaps++;
  }
  if (hasWeb) {
    const configFile = RUNNER_DETECT.playwright.files
      .map((file) => join(root, file))
      .find((file) => existsSync(file));
    const config = configFile ? stripComments(readFileSync(configFile, "utf8")) : "";
    if (/\breuseExistingServer\s*:\s*true\b/.test(config)) {
      messages.push(
        "Playwright hardcodes reuseExistingServer: true — a gate could attach to a stale or unrelated process; "
        + "use the standard !process.env.CI guard or disable reuse",
      );
      gaps++;
    }
  }

  let flows;
  try {
    flows = JSON.parse(readFileSync(flowsFile, "utf8"));
    if (!Array.isArray(flows)) throw new Error("flows.json must be an array");
  } catch (e) {
    return {
      runners,
      flows: 0,
      gaps: gaps + 1,
      depthGaps: 0,
      execution,
      seedPending,
      messages: [...messages, `flows.json invalid — ${e.message}`],
    };
  }

  if (flows.length === 0) {
    messages.push("e2e/flows.json declares no flows — an empty checklist proves nothing");
    gaps++;
  }

  const declaredTargets = new Set(flows
    .filter((flow) => flow && typeof flow === "object" && !Array.isArray(flow))
    .map((flow) => flow.target)
    .filter((target) => target === "web" || target === "native"));
  if (hasWeb && !declaredTargets.has("web")) {
    messages.push("Playwright is configured but e2e/flows.json declares no target:web proof");
    gaps++;
  }
  if (hasNative && !declaredTargets.has("native")) {
    messages.push("Maestro is configured but e2e/flows.json declares no target:native proof");
    gaps++;
  }

  const ids = new Set();
  const names = new Set();
  const proofs = new Set();
  const qualityCheckedSpecs = new Set();
  const enforcePageQuality = declaresFrontendSdk(root);

  for (const flow of flows) {
    if (!flow || typeof flow !== "object" || Array.isArray(flow)) {
      messages.push("journey entry must be an object with id, name, path, target, spec, and terminal");
      gaps++;
      continue;
    }
    const name = flow.name ?? "(unnamed)";
    const unsupportedKeys = Object.keys(flow).filter((key) => !FLOW_KEYS.has(key));
    if (unsupportedKeys.length > 0) {
      messages.push(`journey "${name}" has unsupported field(s): ${unsupportedKeys.join(", ")}`);
      gaps++;
    }
    const spec = String(flow.spec ?? "");
    const id = typeof flow.id === "string" ? flow.id.trim() : "";
    if (!id || !/^[a-z0-9][a-z0-9._-]*$/.test(id) || ids.has(id)) {
      messages.push(`journey "${name}" has a missing, invalid, or duplicate id`);
      gaps++;
    }
    if (id && /^[a-z0-9][a-z0-9._-]*$/.test(id)) ids.add(id);
    if (typeof flow.name !== "string" || !flow.name.trim() || names.has(flow.name)) {
      messages.push(`journey "${name}" has a missing or duplicate name`);
      gaps++;
    }
    if (typeof flow.name === "string" && flow.name.trim()) names.add(flow.name);

    if (flow.path !== "happy" && flow.path !== "sad") {
      messages.push(`journey "${name}" must declare path:happy or path:sad`);
      gaps++;
    }

    const criteria = Array.isArray(flow.criteria) ? flow.criteria : [];
    const criterionIds = criteria.map((criterion) => criterion?.id);
    const criterionEvidence = criteria.map((criterion) => criterion?.evidence);
    if (flow.criteria !== undefined
        && (!Array.isArray(flow.criteria)
          || flow.criteria.some((criterion) => !criterion
            || typeof criterion !== "object"
            || Array.isArray(criterion)
            || Object.keys(criterion).some((key) => key !== "id" && key !== "evidence")
            || typeof criterion.id !== "string"
            || !/^[a-z0-9][a-z0-9._-]*$/.test(criterion.id)
            || typeof criterion.evidence !== "string"
            || !criterion.evidence.trim())
          || new Set(criterionIds).size !== criterionIds.length
          || new Set(criterionEvidence).size !== criterionEvidence.length)) {
      messages.push(
        `journey "${name}" has invalid or duplicate criteria; use distinct { id, evidence } entries`,
      );
      gaps++;
    }
    if ((flow.features?.length ?? 0) > 0 && (!Array.isArray(flow.criteria) || flow.criteria.length === 0)) {
      messages.push(
        `journey "${name}" proves a ViewModel but declares no AVP/Assay criteria; `
          + "happy/sad labels alone are not semantic coverage",
      );
      gaps++;
    }

    if (flow.backendSlices !== undefined
        && (!Array.isArray(flow.backendSlices)
          || flow.backendSlices.some((slice) => typeof slice !== "string" || !/^[A-Za-z_]\w*$/.test(slice))
          || new Set(flow.backendSlices).size !== flow.backendSlices.length)) {
      messages.push(`journey "${name}" has invalid or duplicate backendSlices`);
      gaps++;
    }
    if (flow.backendOutcome !== undefined
        && flow.backendOutcome !== "success" && flow.backendOutcome !== "error") {
      messages.push(`journey "${name}" has invalid backendOutcome; expected success or error`);
      gaps++;
    }
    if ((flow.backendSlices?.length ?? 0) > 0
        && (typeof flow.backendContract !== "string" || !flow.backendContract.trim())) {
      messages.push(`journey "${name}" names backendSlices but has no backendContract`);
      gaps++;
    }
    if (flow.target !== "web" && flow.target !== "native") {
      messages.push(`journey "${name}" must declare target:web or target:native`);
      gaps++;
    }
    if (flow.target === "web" && !/\.(?:spec|test)\.[cm]?[jt]sx?$/i.test(spec)) {
      messages.push(`journey "${name}" is target:web and must name a Playwright .spec/.test JavaScript or TypeScript file`);
      gaps++;
    } else if (flow.target === "native" && !/\.ya?ml$/i.test(spec)) {
      messages.push(`journey "${name}" is target:native and must name a Maestro .yaml/.yml flow`);
      gaps++;
    }

    const specPath = resolve(root, spec);
    const relativeSpec = relative(resolve(root), specPath);
    const outside = relativeSpec === ".." || relativeSpec.startsWith(".." + sep) || isAbsolute(relativeSpec);
    let isFile = false;
    try {
      isFile = !outside && existsSync(specPath) && statSync(specPath).isFile();
    } catch {
      isFile = false;
    }
    const caseName = typeof flow.case === "string" ? flow.case.trim() : "";
    const proofKey = `${outside ? spec : specPath}#${caseName}`;
    if (spec && proofs.has(proofKey)) {
      messages.push(`journey "${name}" reuses proof ${spec}${caseName ? `#${caseName}` : ""}`);
      gaps++;
    }
    if (spec) proofs.add(proofKey);
    if (!spec || outside || !isFile) {
      messages.push(`curated journey "${name}" has no spec (${flow.spec ?? "missing"})`);
      gaps++;
      continue;
    }
    const specSource = readFileSync(specPath, "utf8");
    if (flow.target === "web" && enforcePageQuality && !qualityCheckedSpecs.has(specPath)) {
      qualityCheckedSpecs.add(specPath);
      if (!importsCanonicalPlaywrightTest(specSource)) {
        messages.push(
          `${spec} must import test from @skiesjs/frontend-sdk/playwright so page errors and browser `
            + "warnings fail the E2E gate",
        );
        gaps++;
      }
    }
    const backendBoundSource = `${specSource}\n${importedLocalSource(root, specPath)}`;
    const caseSource = caseName ? testCaseSource(specSource, caseName) : specSource;
    if (caseName && caseSource === null) {
      messages.push(`journey "${name}" names case "${caseName}" but ${spec} declares no enabled test with that title`);
      gaps++;
    }
    for (const criterion of criteria) {
      if (typeof criterion?.id !== "string" || typeof criterion?.evidence !== "string") continue;
      if (assertsTerminal(caseSource ?? specSource, criterion.evidence.trim())) continue;
      messages.push(
        `journey "${name}" claims criterion "${criterion.id}" but its case never asserts the declared `
          + `evidence \`${criterion.evidence}\``,
      );
      gaps++;
    }
    if (flow.target === "native" && !hasNative) {
      messages.push(`journey "${name}" is target:native but the canonical \`maestro test e2e\` runner is not configured`);
      gaps++;
    } else if (flow.target === "web" && !hasWeb) {
      messages.push(`journey "${name}" is target:web but the canonical Playwright runner (playwright.config.*) is not configured`);
      gaps++;
    }

    // Classification belongs to the named case, not its whole file. One real-backend test in a shared spec
    // must never lend its execution tier to neighboring front-only cases.
    const proofSource = caseSource ?? specSource;
    const executionClass = classifySource(spec, `${canonicalBackendImport(specSource)}\n${proofSource}`);
    execution[executionClass] = (execution[executionClass] ?? 0) + 1;
    if (executionClass === "seed-pending") {
      seedPending.push(name);
      messages.push(`journey "${name}" is seed-pending — deterministic seed data is required before it counts`);
      gaps++;
    } else if (executionClass === "disabled") {
      messages.push(`journey "${name}" contains skipped, conditional, or focused test syntax`);
      gaps++;
    } else if (executionClass === "missing") {
      messages.push(`journey "${name}" spec cannot be read (${spec})`);
      gaps++;
      continue;
    }
    if (flow.target === "web" && (flow.backendSlices?.length ?? 0) > 0 && executionClass !== "ci-gated") {
      messages.push(
        `journey "${name}" names backendSlices but its own case is ${executionClass}; `
          + "collect and assert its exact OpenAPI operations with observeBackend and expectBackendSlices or "
          + "waitForBackendSlices from "
          + "@skiesjs/frontend-sdk/playwright-backend in that case",
      );
      gaps++;
    }
    if (flow.target === "web" && (flow.backendSlices?.length ?? 0) > 0 && usesNetworkMock(backendBoundSource)) {
      messages.push(
        `journey "${name}" names backendSlices but ${spec} or an imported local helper installs a network mock; `
          + "move mocked smoke cases to a separate spec and prove backend-bound cases against the real API",
      );
      gaps++;
    }
    if (flow.target === "web" && (flow.backendSlices?.length ?? 0) > 0 && usesDirectBackendCall(backendBoundSource)) {
      messages.push(
        `journey "${name}" names backendSlices but ${spec} or an imported local helper calls the API outside the visible page; `
          + "drive the rendered UI and let observeBackend collect its responses",
      );
      gaps++;
    }
    if (flow.target === "web" && (flow.backendSlices?.length ?? 0) > 0) {
      const contract = readBackendContract(root, flow.backendContract);
      if (contract.error) {
        messages.push(`journey "${name}" has invalid backendContract — ${contract.error}`);
        gaps++;
      } else {
        const unknown = flow.backendSlices.filter((slice) => !contract.operationIds.has(slice));
        if (unknown.length > 0) {
          messages.push(
            `journey "${name}" names backendSlices absent from ${flow.backendContract}: ${unknown.join(", ")}`,
          );
          gaps++;
        }
      }

      const backendProofs = extractBackendProofs(proofSource);
      const expectedStatus = flow.backendOutcome ?? (flow.path === "happy" ? "success" : "error");
      const expectedSlices = JSON.stringify(flow.backendSlices);
      const hasExactProof = backendProofs.some((proof) => proof.contract === flow.backendContract
        && JSON.stringify(proof.slices) === expectedSlices
        && proof.status === expectedStatus);
      if (!hasExactProof) {
        messages.push(
          `journey "${name}" must observe ${flow.backendContract} and assert exactly ${expectedSlices} `
            + `with status:"${expectedStatus}" in its own case`,
        );
        gaps++;
      }
    }

    // Depth (SKYFE-JOURNEY-002): every flow must declare its `terminal` and actually assert it in the spec —
    // otherwise "covered" only proves the journey starts. The focused assertion heuristic ignores comments and
    // requires the marker near an assertion API, so merely mentioning a route in prose never manufactures green.
    const terminal = typeof flow.terminal === "string" ? flow.terminal.trim() : "";
    if (!terminal) {
      messages.push(
        `journey "${name}" declares no \`terminal\` — add the marker (testID or route) its spec asserts ` +
          `after entry to prove the journey reaches its end`,
      );
      depthGaps++;
    } else if (terminal && !assertsTerminal(caseSource ?? specSource, terminal)) {
      messages.push(
        `journey "${name}" never asserts its terminal \`${terminal}\` in ${spec} — the spec may stop at entry ` +
          `instead of proving the journey reaches its end`,
      );
      depthGaps++;
    }
  }

  return { runners, flows: flows.length, gaps, depthGaps, execution, seedPending, messages };
}

function declaresFrontendSdk(root) {
  try {
    const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return [
      packageJson.dependencies,
      packageJson.devDependencies,
      packageJson.peerDependencies,
    ].some((dependencies) => dependencies
      && typeof dependencies["@skiesjs/frontend-sdk"] === "string");
  } catch {
    return false;
  }
}

function importsCanonicalPlaywrightTest(source) {
  const executable = stripComments(source);
  for (const match of executable.matchAll(
    /\bimport\s*\{([^}]*)\}\s*from\s*["']@skiesjs\/frontend-sdk\/playwright["']/g,
  )) {
    const bindings = match[1].split(",").map((binding) => binding.trim());
    if (bindings.some((binding) => /^test(?:\s+as\s+[A-Za-z_$][\w$]*)?$/.test(binding))) return true;
  }
  return false;
}

/** Parse Playwright's stable `--list` lines into file/title pairs. */
export function parsePlaywrightList(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/(?:^|\s)›\s+(.+?):\d+:\d+\s+›\s+(.+)$/)
      ?? line.match(/^\s*(.+?):\d+:\d+\s+›\s+(.+)$/);
    if (!match) return [];
    return [{ spec: match[1].replaceAll("\\", "/").replace(/^\.\//, ""), title: match[2].trim() }];
  });
}

/**
 * Check that every declared web flow is in the runner's collected inventory. This closes config-side narrowing:
 * a checked-in test ignored by `testIgnore`, `testMatch`, or a drifted `testDir` is not release evidence.
 */
export function checkListedWebFlows(flows, listed) {
  const messages = [];
  for (const flow of flows.filter((candidate) => candidate && candidate.target === "web" && typeof candidate.spec === "string")) {
    const expectedSpec = flow.spec.replaceAll("\\", "/").replace(/^\.\//, "");
    const candidates = listed.filter((test) =>
      test.spec === expectedSpec || expectedSpec.endsWith(`/${test.spec}`) || test.spec.endsWith(`/${expectedSpec}`));
    if (candidates.length === 0) {
      messages.push(`${flow.id ?? flow.name ?? expectedSpec}: ${flow.spec} is absent from Playwright's collected test inventory`);
      continue;
    }
    if (typeof flow.case === "string" && flow.case.trim()
        && !candidates.some((test) => test.title === flow.case || test.title.endsWith(` › ${flow.case}`))) {
      messages.push(`${flow.id ?? flow.name ?? expectedSpec}: case "${flow.case}" is absent from Playwright's collected test inventory`);
    }
  }
  return messages;
}

/** Collect and compare the actual Playwright inventory without starting the application stack. */
export function checkPlaywrightInventory(root) {
  let flows;
  try {
    flows = JSON.parse(readFileSync(join(root, "e2e", "flows.json"), "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(flows) || !flows.some((flow) => flow?.target === "web")) return [];

  const onWindows = process.platform === "win32";
  const executable = onWindows ? (process.env.ComSpec ?? "cmd.exe") : "npx";
  const arguments_ = onWindows
    ? ["/d", "/s", "/c", "npx --no-install playwright test --list"]
    : ["--no-install", "playwright", "test", "--list"];
  const run = spawnSync(executable, arguments_, {
    cwd: root,
    encoding: "utf8",
    // Collection imports spec modules but never starts globalSetup, webServer, or a browser. Let modules whose
    // top-level guard normally requires the real preflight load for inventory purposes; the release execution
    // still receives PW_API_READY only from the canonical successful probe.
    env: { ...process.env, SKY_E2E_INVENTORY: "1", PW_API_READY: "1" },
    shell: false,
  });
  if (run.status !== 0) {
    const detail = (run.stderr || run.stdout || run.error?.message || "runner exited without output").trim();
    return [`Playwright could not collect the release inventory: ${detail}`];
  }
  return checkListedWebFlows(flows, parsePlaywrightList(run.stdout ?? ""));
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function hasNonExecutingTest(source) {
  if (/\b[xf](?:it|test|describe|context)\s*\(/.test(source)) return true;

  // Keep this runner-agnostic: Vitest, Jest and Playwright all expose modifiers through the same call-chain
  // shape. The chain matcher deliberately crosses parentheses (test.each(...).skip) and members
  // (test.concurrent.skip), but not statement boundaries, so ordinary later calls are not conflated.
  return /\b(?:test|it|describe|context)(?:(?:\s*\.\s*[A-Za-z_$][\w$]*)|(?:\s*\([^;\r\n]*?\)))*\s*\.\s*(?:skip|fixme|todo|skipIf|runIf|only)\s*\(/.test(source);
}

// A backend-bound browser proof cannot share a spec with request interception. Checking the whole file is
// deliberate: a helper declared above the named case can install the mock while the case itself contains only a
// harmless-looking helper call. Separate front-only smoke specs remain welcome; they simply cannot manufacture
// real-backend evidence for a flow that names backend slices.
function usesNetworkMock(source) {
  const executable = stripComments(source);
  return /\b(?:page|context|browserContext)\s*\.\s*route\s*\(/.test(executable)
    || /\b(?:page|context|browserContext)\s*\.\s*routeFromHAR\s*\(/.test(executable)
    || /\broute\s*\.\s*(?:fulfill|abort)\s*\(/.test(executable)
    || /\bmock[A-Za-z0-9_$]*Api\s*\(/.test(executable)
    || /\bfrom\s*["'][^"']*(?:mock|msw|stub|fake[-_]?api)[^"']*["']/.test(executable)
    || /\b(?:setupServer|setupWorker|rest\.(?:get|post|put|patch|delete)|http\.(?:get|post|put|patch|delete)|graphql\.(?:query|mutation))\s*\(/.test(executable);
}

// A proof must be caused by the rendered application. Direct fetch/APIRequest/generated-client calls can make the
// network ledger green without traversing the visible feature and are therefore rejected in backend-bound specs.
function usesDirectBackendCall(source) {
  const executable = stripComments(source);
  return /\bfetch\s*\(/.test(executable)
    || /\b(?:page|context|request)\s*\.\s*(?:delete|get|head|options|patch|post|put)\s*\(/.test(executable)
    || /\bfrom\s*["'][^"']*client\.gen(?:\/[^"']*)?["']/.test(executable)
    || /\baxios\s*\.\s*(?:delete|get|head|options|patch|post|put|request)\s*\(/.test(executable);
}

// A local helper is part of the proof's executable surface. Reading only the manifest's spec lets a helper hide
// page.route(), fetch(), or a generated client call while the named case presents a clean observation ledger.
// Follow static relative imports recursively, staying inside the frontend root; package imports remain trusted
// dependencies and setup outside this closure cannot manufacture a response inside the observed page.
function importedLocalSource(root, entryPath) {
  const rootPath = resolve(root);
  const seen = new Set([resolve(entryPath)]);
  const sources = [];

  const visit = (parentPath, source) => {
    for (const specifier of localImportSpecifiers(source)) {
      const importedPath = resolveLocalImport(dirname(parentPath), specifier);
      if (!importedPath || !isWithin(rootPath, importedPath) || seen.has(importedPath)) continue;
      seen.add(importedPath);
      const importedSource = readFileSync(importedPath, "utf8");
      sources.push(importedSource);
      visit(importedPath, importedSource);
    }
  };

  visit(resolve(entryPath), readFileSync(entryPath, "utf8"));
  return sources.join("\n");
}

function localImportSpecifiers(source) {
  const executable = stripComments(source);
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["'](\.[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of executable.matchAll(pattern)) specifiers.add(match[1]);
  }
  return specifiers;
}

function resolveLocalImport(parentDirectory, specifier) {
  const base = resolve(parentDirectory, specifier);
  const candidates = extname(base)
    ? [base]
    : [base, ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].map((extension) => `${base}${extension}`),
        ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].map((extension) => join(base, `index${extension}`))];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function isWithin(root, path) {
  const pathFromRoot = relative(root, path);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== "..");
}

function canonicalBackendImport(source) {
  const executable = stripComments(source);
  return [...executable.matchAll(
    /\bimport\s*\{([^}]*)\}\s*from\s*["']@skiesjs\/frontend-sdk\/playwright-backend["']\s*;?/g,
  )].map((match) => match[0]).join("\n");
}

function importsCanonicalBackendProof(source) {
  const identifiers = new Set();
  for (const match of source.matchAll(
    /\bimport\s*\{([^}]*)\}\s*from\s*["']@skiesjs\/frontend-sdk\/playwright-backend["']/g,
  )) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim();
      if (name && !/\s+as\s+/.test(name)) identifiers.add(name);
    }
  }
  return identifiers.has("observeBackend")
    && (identifiers.has("expectBackendSlices") || identifiers.has("waitForBackendSlices"));
}

function hasBackendObservation(source) {
  return /\bobserveBackend\s*\(/.test(source)
    && /\b(?:expect|waitFor)BackendSlices\s*\(/.test(source);
}

function extractBackendProofs(source) {
  const executable = stripComments(source);
  const observation = executable.match(
    /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+observeBackend\s*\(\s*([A-Za-z_$][\w$]*)\s*,\s*(["'])([^"']+)\3\s*\)/,
  );
  if (!observation) return [];
  const variable = escapeRegex(observation[1]);
  const assertionPattern = new RegExp(
    `\\b(?:expect|waitFor)BackendSlices\\s*\\(\\s*${variable}\\s*,\\s*\\[([^\\]]*)\\]\\s*,`
      + `\\s*\\{\\s*status\\s*:\\s*(["'])(success|error)\\2\\s*,?\\s*`
      + `(?:(?:timeoutMs|intervalMs)\\s*:\\s*\\d+(?:\\.\\d+)?\\s*,?\\s*)*\\}\\s*,?\\s*\\)`,
    "g",
  );
  const proofs = [];
  for (const assertion of executable.matchAll(assertionPattern)) {
    const rawSlices = assertion[1];
    const slices = [...rawSlices.matchAll(/(["'])([^"']+)\1/g)].map((match) => match[2]);
    const residue = rawSlices.replace(/(["'])[^"']+\1/g, "").replace(/[\s,]/g, "");
    if (slices.length === 0 || residue) continue;
    proofs.push({ contract: observation[4], slices, status: assertion[3] });
  }
  return proofs;
}

function readBackendContract(root, value) {
  if (typeof value !== "string" || !value.trim()) return { error: "backendContract is missing" };
  const path = resolve(root, value);
  const relativePath = relative(resolve(root), path);
  if (relativePath === ".." || relativePath.startsWith(".." + sep) || isAbsolute(relativePath)) {
    return { error: "backendContract resolves outside the frontend root" };
  }
  try {
    if (!statSync(path).isFile()) return { error: `${value} is not a file` };
    const document = JSON.parse(readFileSync(path, "utf8"));
    if (!document?.paths || typeof document.paths !== "object") return { error: `${value} has no OpenAPI paths` };
    const operationIds = new Set();
    for (const item of Object.values(document.paths)) {
      if (!item || typeof item !== "object") continue;
      for (const operation of Object.values(item)) {
        if (operation && typeof operation === "object" && typeof operation.operationId === "string") {
          operationIds.add(operation.operationId);
        }
      }
    }
    return { operationIds };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function testCaseSource(source, title) {
  const executable = stripComments(source);
  const prefix = "\\b(?:test|it)(?:(?:\\s*\\.\\s*(?!(?:describe|step)\\b)[A-Za-z_$][\\w$]*)"
    + "|(?:\\s*\\([^;\\r\\n]*?\\)))*\\s*\\(\\s*";
  const exact = new RegExp(prefix + "[\"'`]" + escapeRegex(title) + "[\"'`]");
  const match = exact.exec(executable);
  if (!match) return null;

  const nextTest = new RegExp(prefix + "[\"'`]", "g");
  nextTest.lastIndex = match.index + match[0].length;
  const next = nextTest.exec(executable);
  return executable.slice(match.index, next?.index ?? executable.length);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertsTerminal(source, terminal) {
  const executable = stripComments(source);
  let at = executable.indexOf(terminal);
  while (at >= 0) {
    const context = executable.slice(Math.max(0, at - 240), Math.min(executable.length, at + terminal.length + 240));
    if (/\b(?:expect|assert|toHaveURL|waitForURL|getByTestId|assertVisible)\b/.test(context)) return true;
    at = executable.indexOf(terminal, at + terminal.length);
  }
  return false;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , root] = process.argv;
  if (!root) {
    console.error("usage: skyfe-e2e-doctor <frontend-root>");
    process.exit(2);
  }
  const result = checkE2e(root);
  const inventoryMessages = result.runners.includes("playwright") ? checkPlaywrightInventory(root) : [];
  const execution = result.execution;
  console.log(
    `SKYFE-E2E: ${result.flows} curated journey(s) `
      + `[real-browser CI gate: ${execution["ci-gated"]}, front-only smoke: ${execution["front-only"]}, `
      + `seed-pending: ${execution["seed-pending"]}, disabled: ${execution.disabled}, native: ${execution.native}], `
      + `runners=[${result.runners.join(", ") || "none"}], ${result.gaps} roadmap gap(s), `
      + `${result.depthGaps} depth gap(s).`,
  );
  for (const message of result.messages) console.log(`  - ${message}`);
  for (const message of inventoryMessages) console.log(`  - ${message}`);
  if (result.seedPending.length)
    console.log(`  - seed-pending: ${result.seedPending.join(", ")}`);
  process.exit(result.gaps > 0 || result.depthGaps > 0 || inventoryMessages.length > 0 ? 1 : 0);
}
