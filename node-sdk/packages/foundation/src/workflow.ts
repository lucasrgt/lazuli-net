import { checkFoundationAssets, loadCsmConfig } from "./assets.js";
import { loadConfig } from "./config.js";
import { readCsmRecords, recordsHuman, type CsmFamily, type CsmRecord } from "./csm.js";
import { runGate } from "./gate.js";
import { FoundationError, type GateDependencies, type GateMode } from "./types.js";

export interface ContextOptions {
  readonly root: string;
  readonly task: string;
  readonly paths?: readonly string[];
  readonly events?: readonly string[];
  readonly limit?: number;
  readonly json?: boolean;
}

export interface ContextStep {
  readonly id: CsmFamily;
  readonly records: readonly CsmRecord[];
  readonly findings: readonly string[];
}

export interface ContextResult {
  readonly exitCode: 0 | 1;
  readonly task: string;
  readonly steps: readonly ContextStep[];
  readonly human: string;
}

export interface CheckOptions {
  readonly root: string;
  readonly configPath?: string;
  readonly task: string;
  readonly mode: GateMode;
  readonly changedPaths?: readonly string[];
  readonly baseRevision?: string;
  readonly mergeBase?: string;
  readonly fast?: boolean;
  readonly reportPath?: string | false;
  readonly markdownPath?: string | false;
  readonly forwardOutput?: boolean;
}

export interface CheckStep {
  readonly id: "gate" | CsmFamily;
  readonly exitCode: 0 | 1;
  readonly findings: readonly string[];
}

export interface CheckResult {
  readonly exitCode: 0 | 1;
  readonly task: string;
  readonly steps: readonly CheckStep[];
  readonly human: string;
}

function tokens(options: ContextOptions): string[] {
  return [options.task, ...(options.paths ?? []), ...(options.events ?? [])]
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9._/-]+/u))
    .filter((value) => value.length >= 3);
}

function relevance(record: CsmRecord, terms: readonly string[]): number {
  const haystack = `${record.id} ${record.title} ${record.statement} ${record.violation ?? ""}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

export async function runContext(options: ContextOptions): Promise<ContextResult> {
  if (options.task.trim().length === 0) throw new FoundationError("context task must be non-empty", "invocation");
  const limit = options.limit ?? 8;
  if (!Number.isInteger(limit) || limit < 1 || limit > 24) throw new Error("context limit must be an integer from 1 to 24");
  const terms = tokens(options);
  const steps: ContextStep[] = [];
  for (const family of ["wtw", "rtw", "nya", "nwc"] as const) {
    const read = await readCsmRecords(options.root, family);
    const ranked = read.records.map((record, index) => ({ record, index, score: relevance(record, terms) }))
      .filter((item) => family !== "nwc" || item.record.status !== "resolved")
      .filter((item) => terms.length === 0 || item.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, limit)
      .map((item) => item.record);
    steps.push({ id: family, records: ranked, findings: read.findings });
  }
  const lines = [`Skies Node context — ${options.task}`];
  for (const step of steps) {
    lines.push("", `[${step.id}] bounded repository context`);
    lines.push(recordsHuman(step.id, { records: step.records, findings: step.findings }).trimEnd());
  }
  const red = steps.some((step) => step.findings.length > 0);
  lines.push("", red ? "Context completed with foundation findings." : "Context retrieval complete.");
  return { exitCode: red ? 1 : 0, task: options.task, steps, human: `${lines.join("\n")}
` };
}

export async function runFoundationCheck(
  options: CheckOptions,
  dependencies: GateDependencies = {},
): Promise<CheckResult> {
  if (options.task.trim().length === 0) throw new FoundationError("check task must be non-empty", "invocation");
  // Preflight both closed configurations before starting an expensive proof command.
  loadConfig(options.root, options.configPath);
  await loadCsmConfig(options.root);
  const gate = await runGate({
    root: options.root, mode: options.mode,
    ...(options.configPath === undefined ? {} : { configPath: options.configPath }),
    ...(options.changedPaths === undefined ? {} : { changedPaths: options.changedPaths }),
    ...(options.baseRevision === undefined ? {} : { baseRevision: options.baseRevision }),
    ...(options.mergeBase === undefined ? {} : { mergeBase: options.mergeBase }),
    ...(options.fast === undefined ? {} : { fast: options.fast }),
    ...(options.reportPath === undefined ? {} : { reportPath: options.reportPath }),
    ...(options.markdownPath === undefined ? {} : { markdownPath: options.markdownPath }),
    forwardOutput: options.forwardOutput ?? true,
  }, dependencies);
  const steps: CheckStep[] = [{
    id: "gate", exitCode: gate.exitCode,
    findings: gate.receipt.findings.concat(gate.receipt.matrix.filter((row) => ["fail", "not-run", "no-proof"].includes(row.outcome)).map((row) => `${row.criterion}: ${row.outcome}`)),
  }];
  const assetFindings = await checkFoundationAssets(options.root);
  for (const family of ["wtw", "rtw", "nya", "nwc"] as const) {
    const records = await readCsmRecords(options.root, family);
    const findings = [...records.findings, ...(family === "wtw" ? assetFindings : [])];
    steps.push({ id: family, exitCode: findings.length > 0 ? 1 : 0, findings });
  }
  const lines = [`Skies Node check — ${options.task}`, gate.human.trimEnd()];
  for (const step of steps.slice(1)) {
    lines.push(`  ${step.exitCode === 0 ? "PASS" : "FAIL"} ${step.id}`);
    for (const finding of step.findings) lines.push(`    ${finding}`);
  }
  const red = steps.some((step) => step.exitCode !== 0);
  lines.push(red ? "Check verdict: RED" : "Check verdict: GREEN");
  return { exitCode: red ? 1 : 0, task: options.task, steps, human: `${lines.join("\n")}
` };
}
