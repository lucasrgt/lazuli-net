import { relative } from "node:path";
import { loadConfig, normalizeRelativePath } from "./config.js";
import { criteriaFindings, matrixFromReceipt, matrixHuman } from "./inventory.js";
import { DefaultGitClient, defaultCommandRunner } from "./runner.js";
import { applyTextPlan, assertSafeDirectory } from "./safe-fs.js";
import { scanSuppressions } from "./suppression.js";
import type {
  FoundationConfig, GateDependencies, GateMode, GateOptions, GateReceipt, GateRun, LaneReceipt, ProofReceipt,
} from "./types.js";

function globRegex(pattern: string): RegExp {
  let expression = "^";
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index]!;
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        index++;
        if (pattern[index + 1] === "/") { index++; expression += "(?:.*/)?"; }
        else expression += ".*";
      } else expression += "[^/]*";
    } else if (character === "?") expression += "[^/]";
    else expression += character.replace(/[|\{}()[\]^$+?.]/gu, "\$&");
  }
  return new RegExp(`${expression}$`, "u");
}

export function matchesScope(path: string, scope: string): boolean {
  return globRegex(scope).test(path);
}

export interface Selection {
  readonly selected: ReadonlySet<string>;
  readonly paths: readonly string[];
  readonly reasons: readonly string[];
}

function dependencyClosure(config: FoundationConfig, seed: Set<string>, reasons: string[]): Set<string> {
  const byId = new Map(config.proofs.map((proof) => [proof.id, proof]));
  const queue = [...seed];
  while (queue.length > 0) {
    const proofId = queue.shift()!;
    for (const dependency of byId.get(proofId)?.dependsOn ?? []) {
      if (!seed.has(dependency)) {
        seed.add(dependency); queue.push(dependency);
        reasons.push(`proof '${proofId}' requires '${dependency}'`);
      }
    }
  }
  return seed;
}

export function selectProofs(
  config: FoundationConfig,
  mode: GateMode,
  changedPaths: readonly string[] = [],
): Selection {
  const reasons: string[] = [];
  if (mode === "full") {
    return { selected: new Set(config.proofs.map((proof) => proof.id)), paths: [], reasons: ["full mode selects every proof"] };
  }
  if (mode === "base") {
    const selected = new Set(config.proofs.filter((proof) => proof.kind === "unit" || proof.kind === "integration").map((proof) => proof.id));
    reasons.push("base mode selects every unit and integration proof");
    return { selected: dependencyClosure(config, selected, reasons), paths: [], reasons };
  }

  const paths = [...new Set(changedPaths.map((path, index) => normalizeRelativePath(path, `changedPaths[${index}]`)))]
    .sort((left, right) => left.localeCompare(right));
  const selected = new Set<string>();
  for (const path of paths) {
    const proofMatches = config.proofs.filter((proof) => proof.sourceScopes.some((scope) => matchesScope(path, scope)));
    if (config.forceFullScopes.some((scope) => matchesScope(path, scope))) {
      for (const proof of config.proofs) selected.add(proof.id);
      reasons.push(`'${path}' matches a force-full scope`);
    } else if (proofMatches.length > 0) {
      for (const proof of proofMatches) selected.add(proof.id);
      reasons.push(`'${path}' selects ${proofMatches.map((proof) => proof.id).join(", ")}`);
    } else if (config.ignoreScopes.some((scope) => matchesScope(path, scope))) {
      reasons.push(`'${path}' is explicitly ignored`);
    } else {
      for (const proof of config.proofs) selected.add(proof.id);
      reasons.push(`'${path}' has no mapping; fail-closed widening selects every proof`);
    }
  }
  return { selected: dependencyClosure(config, selected, reasons), paths, reasons };
}

function laneReceipt(
  id: string,
  command: readonly string[],
  cwd: string,
  timeoutMs: number,
  proofIds: readonly string[],
  result: Awaited<ReturnType<NonNullable<GateDependencies["runner"]>>>,
): LaneReceipt {
  return {
    id, command, cwd, timeoutMs, proofIds, exitCode: result.exitCode, signal: result.signal,
    timedOut: result.timedOut, durationMs: result.durationMs, stdout: result.stdout, stderr: result.stderr,
    ...(result.error === undefined ? {} : { error: result.error }),
  };
}

function receiptMarkdown(receipt: GateReceipt): string {
  const lines = [
    "# Verification matrix", "", `**Gate verdict: ${receipt.verdict.toUpperCase()}**`, "",
    `Mode: \`${receipt.mode}\`  `, `Configuration: \`${receipt.config}\`  `,
    `Fingerprint: \`${receipt.configFingerprint}\``, "", "| Criterion | Proofs | Verdict |", "|---|---|---|",
  ];
  for (const row of receipt.matrix) lines.push(`| \`${row.criterion}\` | ${row.proofIds.map((id) => `\`${id}\``).join(", ") || "—"} | **${row.outcome.toUpperCase()}** |`);
  lines.push("", "## Executed lanes", "");
  if (receipt.lanes.length === 0) lines.push("No lane executed.");
  for (const lane of receipt.lanes) {
    const exit = lane.exitCode === null ? lane.signal ?? "not started" : String(lane.exitCode);
    lines.push(`- \`${lane.id}\`: exit ${exit}; ${lane.durationMs} ms; proofs ${lane.proofIds.map((id) => `\`${id}\``).join(", ")}`);
  }
  if (receipt.findings.length > 0) lines.push("", "## Findings", "", ...receipt.findings.map((finding) => `- ${finding}`));
  if (receipt.selectionReasons.length > 0) lines.push("", "## Selection", "", ...receipt.selectionReasons.map((reason) => `- ${reason}`));
  return `${lines.join("\n")}
`;
}

function receiptHuman(receipt: GateReceipt): string {
  const lines = [
    `Skies Node gate (${receipt.mode}) — ${receipt.selectedProofs.length}/${receipt.proofResults.length} proof(s) selected`,
  ];
  if (receipt.changedPaths.length > 0) lines.push(`  changed: ${receipt.changedPaths.join(", ")}`);
  for (const reason of receipt.selectionReasons) lines.push(`  select: ${reason}`);
  for (const lane of receipt.lanes) {
    const result = lane.exitCode === 0 && !lane.timedOut ? "PASS" : "FAIL";
    lines.push(`  ${result} lane ${lane.id} (${lane.durationMs}ms, exit=${lane.exitCode ?? lane.signal ?? "none"})`);
  }
  lines.push(matrixHuman(receipt.matrix).trimEnd());
  for (const finding of receipt.findings) lines.push(`  finding: ${finding}`);
  lines.push(`Gate verdict: ${receipt.verdict.toUpperCase()}`);
  return `${lines.join("\n")}
`;
}

export async function runGate(options: GateOptions, dependencies: GateDependencies = {}): Promise<GateRun> {
  const config = loadConfig(options.root, options.configPath);
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now().toISOString();
  let selection: Selection;
  let baseRevision: string | null = null;
  if (options.mode === "affected" && options.changedPaths === undefined) {
    baseRevision = options.mergeBase ?? config.gitBase;
    try {
      const changed = await (dependencies.git ?? new DefaultGitClient()).changedPaths(config.root, baseRevision);
      selection = selectProofs(config, "affected", changed);
    } catch (error) {
      selection = selectProofs(config, "full");
      selection = {
        ...selection,
        reasons: [`Git impact discovery failed; fail-closed widening selects every proof: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  } else selection = selectProofs(config, options.mode, options.changedPaths);

  const laneIds = [...new Set(config.proofs.filter((proof) => selection.selected.has(proof.id)).map((proof) => proof.lane))];
  const runner = dependencies.runner ?? defaultCommandRunner;
  const lanes: LaneReceipt[] = [];
  for (const laneId of laneIds) {
    const lane = config.lanes.find((item) => item.id === laneId)!;
    const proofIds = config.proofs.filter((proof) => proof.lane === lane.id && selection.selected.has(proof.id)).map((proof) => proof.id);
    const cwd = await assertSafeDirectory(config.root, lane.cwd);
    const result = await runner({ command: lane.command, cwd, env: lane.env, timeoutMs: lane.timeoutMs, forwardOutput: options.forwardOutput ?? true });
    lanes.push(laneReceipt(lane.id, lane.command, lane.cwd, lane.timeoutMs, proofIds, result));
  }
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  const proofResults: ProofReceipt[] = config.proofs.map((proof) => {
    let outcome: ProofReceipt["outcome"] = "not-affected";
    if (selection.selected.has(proof.id)) {
      const lane = laneById.get(proof.lane);
      if (lane === undefined) outcome = "not-run";
      else outcome = lane.exitCode === 0 && lane.signal === null && !lane.timedOut && lane.error === undefined ? "pass" : "fail";
    }
    return { id: proof.id, kind: proof.kind, lane: proof.lane, criteria: proof.criteria, outcome };
  });
  const findings = [...criteriaFindings(config), ...await scanSuppressions(config.root)];
  if (options.mode === "base" && selection.selected.size === 0) findings.push("base mode selected no unit or integration proof");
  if (options.mode === "full" && selection.selected.size === 0) findings.push("full mode selected no proof");
  const draft = {
    schemaVersion: 1 as const, type: "skies-node-foundation-gate" as const,
    config: relative(config.root, config.path).replaceAll("\\", "/"), configFingerprint: config.fingerprint,
    mode: options.mode, baseRevision, changedPaths: selection.paths, selectionReasons: selection.reasons,
    selectedProofs: config.proofs.filter((proof) => selection.selected.has(proof.id)).map((proof) => proof.id),
    proofResults, lanes, matrix: [], findings, verdict: "red" as const, startedAt, finishedAt: "",
  };
  const matrix = matrixFromReceipt(config, draft as GateReceipt);
  const red = findings.length > 0 || matrix.some((row) => row.outcome === "fail" || row.outcome === "not-run" || row.outcome === "no-proof");
  const noChanges = options.mode === "affected" && selection.selected.size === 0 && !red;
  const receipt: GateReceipt = {
    ...draft, matrix, verdict: red ? "red" : noChanges ? "no-changes" : "green", finishedAt: now().toISOString(),
  };
  const markdown = receiptMarkdown(receipt);
  const reportPath = options.reportPath === undefined
    ? options.mode === "full" ? "VERIFICATION.json" : ".skies/foundation/gate-receipt.json"
    : options.reportPath;
  const markdownPath = options.markdownPath === undefined ? options.mode === "full" ? "VERIFICATION.md" : false : options.markdownPath;
  const changes = [];
  if (reportPath !== false) changes.push({ path: reportPath, content: `${JSON.stringify(receipt, null, 2)}
`, overwrite: true });
  if (markdownPath !== false) changes.push({ path: markdownPath, content: markdown, overwrite: true });
  if (changes.length > 0) await applyTextPlan(config.root, changes);
  return { exitCode: red ? 1 : 0, receipt, human: receiptHuman(receipt), markdown };
}
