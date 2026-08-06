import { readdir } from "node:fs/promises";
import { loadCsmConfig } from "./assets.js";
import { applyTextPlan, assertSafeDirectory, readSafeText, type TextAction } from "./safe-fs.js";
import { FoundationError } from "./types.js";

export type CsmFamily = "nwc" | "nya" | "rtw" | "wtw";
export type WtwKind = "decision" | "invariant";

export interface CsmRecord {
  readonly schemaVersion: 1;
  readonly family: CsmFamily;
  readonly id: string;
  readonly title: string;
  readonly statement: string;
  readonly kind?: WtwKind;
  readonly violation?: string;
  readonly status?: "open" | "resolved";
}

export interface RecordInput {
  readonly id: string;
  readonly title: string;
  readonly statement: string;
  readonly kind?: WtwKind;
  readonly violation?: string;
}

export interface RecordRead {
  readonly records: readonly CsmRecord[];
  readonly findings: readonly string[];
}

const RECORD_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/u;

function recordPath(storage: string, family: CsmFamily, id: string, kind?: WtwKind): string {
  if (!RECORD_ID.test(id)) throw new FoundationError("record id must use lowercase letters, digits, dot, dash, or underscore", "invocation");
  if (family === "wtw") {
    if (kind !== "decision" && kind !== "invariant") throw new FoundationError("WTW records require kind decision or invariant", "invocation");
    return `${storage}/wtw/records/${kind}s/${id}.json`;
  }
  const directory = family === "nwc" ? "deferments" : family === "nya" ? "scars" : "ways";
  return `${storage}/${family}/${directory}/${id}.json`;
}

function validateRecord(value: unknown, expected: CsmFamily, path: string): CsmRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} is not an object`);
  const raw = value as Record<string, unknown>;
  const allowed = ["schemaVersion", "family", "id", "title", "statement", "kind", "violation", "status"];
  const unknown = Object.keys(raw).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${path} has unknown key(s): ${unknown.sort().join(", ")}`);
  if (raw.schemaVersion !== 1 || raw.family !== expected || typeof raw.id !== "string" || !RECORD_ID.test(raw.id)
      || typeof raw.title !== "string" || raw.title.trim().length === 0
      || typeof raw.statement !== "string" || raw.statement.trim().length === 0) {
    throw new Error(`${path} has an invalid record shape`);
  }
  if (expected === "wtw" && raw.kind !== "decision" && raw.kind !== "invariant") throw new Error(`${path} has an invalid WTW kind`);
  if (raw.violation !== undefined && typeof raw.violation !== "string") throw new Error(`${path}.violation must be a string`);
  if (expected === "nwc" && raw.status !== "open" && raw.status !== "resolved") throw new Error(`${path} has an invalid deferment status`);
  return {
    schemaVersion: 1, family: expected, id: raw.id, title: raw.title, statement: raw.statement,
    ...(raw.kind === undefined ? {} : { kind: raw.kind as WtwKind }),
    ...(raw.violation === undefined ? {} : { violation: raw.violation as string }),
    ...(raw.status === undefined ? {} : { status: raw.status as "open" | "resolved" }),
  };
}

function directories(storage: string, family: CsmFamily): string[] {
  if (family === "wtw") return [`${storage}/wtw/records/decisions`, `${storage}/wtw/records/invariants`];
  const name = family === "nwc" ? "deferments" : family === "nya" ? "scars" : "ways";
  return [`${storage}/${family}/${name}`];
}

export async function writeCsmRecord(
  root: string,
  family: CsmFamily,
  input: RecordInput,
  dryRun = false,
): Promise<readonly TextAction[]> {
  if (input.title.trim().length === 0 || input.statement.trim().length === 0) {
    throw new FoundationError("record title and statement must be non-empty", "invocation");
  }
  const config = await loadCsmConfig(root);
  const record: CsmRecord = {
    schemaVersion: 1, family, id: input.id, title: input.title.trim(), statement: input.statement.trim(),
    ...(family === "wtw" ? { kind: input.kind } : {}),
    ...(input.violation === undefined ? {} : { violation: input.violation.trim() }),
    ...(family === "nwc" ? { status: "open" as const } : {}),
  };
  const path = recordPath(config.storage, family, input.id, input.kind);
  return applyTextPlan(root, [{ path, content: `${JSON.stringify(record, null, 2)}
`, overwrite: true }], dryRun);
}

export async function resolveDeferment(root: string, id: string, dryRun = false): Promise<readonly TextAction[]> {
  const config = await loadCsmConfig(root);
  const path = recordPath(config.storage, "nwc", id);
  const content = await readSafeText(root, path);
  if (content === undefined) throw new FoundationError(`deferment '${id}' does not exist`, "invocation");
  let record: CsmRecord;
  try { record = validateRecord(JSON.parse(content) as unknown, "nwc", path); } catch (error) {
    throw new FoundationError(error instanceof Error ? error.message : String(error), "config");
  }
  const resolved = { ...record, status: "resolved" as const };
  return applyTextPlan(root, [{ path, content: `${JSON.stringify(resolved, null, 2)}
`, overwrite: true }], dryRun);
}

export async function readCsmRecords(root: string, family: CsmFamily): Promise<RecordRead> {
  const config = await loadCsmConfig(root);
  const records: CsmRecord[] = [];
  const findings: string[] = [];
  for (const relativeDirectory of directories(config.storage, family)) {
    let directory: string;
    try { directory = await assertSafeDirectory(root, relativeDirectory); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") { findings.push(`missing record directory '${relativeDirectory}'`); continue; }
      if (error instanceof FoundationError && error.message.endsWith("is missing")) { findings.push(`missing record directory '${relativeDirectory}'`); continue; }
      throw error;
    }
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === ".gitkeep") continue;
      const path = `${relativeDirectory}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new FoundationError(`refusing symbolic record '${path}'`, "io");
      if (!entry.isFile() || !entry.name.endsWith(".json")) { findings.push(`unknown record asset '${path}'`); continue; }
      const content = await readSafeText(root, path);
      try {
        const record = validateRecord(JSON.parse(content ?? "") as unknown, family, path);
        if (`${record.id}.json` !== entry.name) findings.push(`record '${path}' has an id/filename mismatch`);
        else if (records.some((item) => item.id === record.id)) findings.push(`duplicate ${family.toUpperCase()} record id '${record.id}'`);
        else records.push(record);
      } catch (error) { findings.push(error instanceof Error ? error.message : String(error)); }
    }
  }
  return { records, findings };
}

export function recordsHuman(family: CsmFamily, read: RecordRead): string {
  const visible = family === "nwc" ? read.records.filter((record) => record.status !== "resolved") : read.records;
  const lines = [`${family.toUpperCase()} — ${visible.length} record(s)`];
  if (visible.length === 0) lines.push(family === "nwc" ? "  No deferments are due." : "  No records found.");
  for (const record of visible) {
    lines.push(`  [${record.id}] ${record.title}${record.kind === undefined ? "" : ` (${record.kind})`}`);
    lines.push(`    ${record.statement}`);
    if (record.violation !== undefined && record.violation.length > 0) lines.push(`    violation: ${record.violation}`);
  }
  for (const finding of read.findings) lines.push(`  finding: ${finding}`);
  return `${lines.join("\n")}
`;
}
