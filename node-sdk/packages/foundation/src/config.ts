import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  FoundationError,
  PROOF_KINDS,
  type Criterion,
  type FoundationConfig,
  type Lane,
  type Proof,
  type ProofKind,
} from "./types.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const TOP_KEYS = ["schemaVersion", "criteria", "lanes", "proofs", "ignoreScopes", "forceFullScopes", "git"];

function object(value: unknown, at: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new FoundationError(`${at} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], at: string): void {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key)).sort();
  if (unknown.length > 0) throw new FoundationError(`${at} has unknown key(s): ${unknown.join(", ")}`);
}

function array(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) throw new FoundationError(`${at} must be an array`);
  return value;
}

function text(value: unknown, at: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0)) {
    throw new FoundationError(`${at} must be ${allowEmpty ? "a string" : "a non-empty string"}`);
  }
  return value;
}

function id(value: unknown, at: string): string {
  const result = text(value, at);
  if (!ID.test(result)) throw new FoundationError(`${at} is not a portable identifier`);
  return result;
}

function unique(values: readonly string[], at: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new FoundationError(`${at} contains duplicate '${value}'`);
    seen.add(value);
  }
}

export function normalizeRelativePath(value: string, at: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (normalized.length === 0 || normalized.includes("\0") || isAbsolute(value) || /^[A-Za-z]:/u.test(normalized)) {
    throw new FoundationError(`${at} must be a safe relative path`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "")) {
    throw new FoundationError(`${at} must not contain empty or parent segments`);
  }
  return parts.filter((part) => part !== ".").join("/") || ".";
}

function glob(value: unknown, at: string): string {
  const result = normalizeRelativePath(text(value, at), at);
  if (result.startsWith("!")) throw new FoundationError(`${at} must not be a negated glob`);
  return result;
}

function strings(value: unknown, at: string, item: (value: unknown, at: string) => string): string[] {
  return array(value, at).map((entry, index) => item(entry, `${at}[${index}]`));
}

function parseCriteria(value: unknown): Criterion[] {
  const result = array(value, "criteria").map((entry, index) => {
    const raw = object(entry, `criteria[${index}]`);
    exact(raw, ["id", "statement"], `criteria[${index}]`);
    return { id: id(raw.id, `criteria[${index}].id`), statement: text(raw.statement, `criteria[${index}].statement`) };
  });
  unique(result.map((criterion) => criterion.id), "criteria ids");
  return result;
}

function parseLanes(value: unknown): Lane[] {
  const result = array(value, "lanes").map((entry, index) => {
    const at = `lanes[${index}]`;
    const raw = object(entry, at);
    exact(raw, ["id", "command", "timeoutMs", "cwd", "env"], at);
    const command = strings(raw.command, `${at}.command`, text);
    if (command.length === 0) throw new FoundationError(`${at}.command must not be empty`);
    const timeoutMs = raw.timeoutMs;
    if (!Number.isInteger(timeoutMs) || (timeoutMs as number) < 100 || (timeoutMs as number) > 86_400_000) {
      throw new FoundationError(`${at}.timeoutMs must be an integer from 100 to 86400000`);
    }
    const envRaw = raw.env === undefined ? {} : object(raw.env, `${at}.env`);
    const env = Object.fromEntries(Object.entries(envRaw).sort().map(([key, item]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) throw new FoundationError(`${at}.env has invalid key '${key}'`);
      return [key, text(item, `${at}.env.${key}`, true)];
    }));
    const cwd = raw.cwd === undefined ? "." : normalizeRelativePath(text(raw.cwd, `${at}.cwd`), `${at}.cwd`);
    return { id: id(raw.id, `${at}.id`), command: command as [string, ...string[]], timeoutMs: timeoutMs as number, cwd, env };
  });
  unique(result.map((lane) => lane.id), "lane ids");
  return result;
}

function parseProofs(value: unknown): Proof[] {
  const result = array(value, "proofs").map((entry, index) => {
    const at = `proofs[${index}]`;
    const raw = object(entry, at);
    exact(raw, ["id", "kind", "lane", "criteria", "sourceScopes", "dependsOn", "description"], at);
    const kind = text(raw.kind, `${at}.kind`);
    if (!(PROOF_KINDS as readonly string[]).includes(kind)) {
      throw new FoundationError(`${at}.kind must be one of ${PROOF_KINDS.join(", ")}`);
    }
    const criteria = strings(raw.criteria, `${at}.criteria`, id);
    const sourceScopes = strings(raw.sourceScopes, `${at}.sourceScopes`, glob);
    const dependsOn = raw.dependsOn === undefined ? [] : strings(raw.dependsOn, `${at}.dependsOn`, id);
    if (criteria.length === 0) throw new FoundationError(`${at}.criteria must cite at least one criterion`);
    if (sourceScopes.length === 0) throw new FoundationError(`${at}.sourceScopes must declare at least one scope`);
    unique(criteria, `${at}.criteria`);
    unique(sourceScopes, `${at}.sourceScopes`);
    unique(dependsOn, `${at}.dependsOn`);
    return {
      id: id(raw.id, `${at}.id`), kind: kind as ProofKind, lane: id(raw.lane, `${at}.lane`), criteria,
      sourceScopes, dependsOn, description: raw.description === undefined ? "" : text(raw.description, `${at}.description`),
    };
  });
  unique(result.map((proof) => proof.id), "proof ids");
  return result;
}

function validateReferences(criteria: readonly Criterion[], lanes: readonly Lane[], proofs: readonly Proof[]): void {
  const criterionIds = new Set(criteria.map((item) => item.id));
  const laneIds = new Set(lanes.map((item) => item.id));
  const proofIds = new Set(proofs.map((item) => item.id));
  for (const proof of proofs) {
    if (!laneIds.has(proof.lane)) throw new FoundationError(`proof '${proof.id}' references unknown lane '${proof.lane}'`);
    for (const citation of proof.criteria) {
      if (!criterionIds.has(citation)) throw new FoundationError(`proof '${proof.id}' cites unknown criterion '${citation}'`);
    }
    for (const dependency of proof.dependsOn) {
      if (!proofIds.has(dependency)) throw new FoundationError(`proof '${proof.id}' depends on unknown proof '${dependency}'`);
      if (dependency === proof.id) throw new FoundationError(`proof '${proof.id}' cannot depend on itself`);
    }
  }
  const visit = (proofId: string, stack: Set<string>, done: Set<string>): void => {
    if (stack.has(proofId)) throw new FoundationError(`proof dependency cycle includes '${proofId}'`);
    if (done.has(proofId)) return;
    stack.add(proofId);
    for (const dependency of proofs.find((proof) => proof.id === proofId)?.dependsOn ?? []) visit(dependency, stack, done);
    stack.delete(proofId); done.add(proofId);
  };
  const done = new Set<string>();
  for (const proof of proofs) visit(proof.id, new Set(), done);
}

export function parseConfig(json: string, path: string, root: string): FoundationConfig {
  let value: unknown;
  try { value = JSON.parse(json) as unknown; } catch (error) {
    throw new FoundationError(`cannot parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const raw = object(value, "config");
  exact(raw, TOP_KEYS, "config");
  if (raw.schemaVersion !== 1) throw new FoundationError("schemaVersion must be 1");
  const criteria = parseCriteria(raw.criteria);
  const lanes = parseLanes(raw.lanes);
  const proofs = parseProofs(raw.proofs);
  const ignoreScopes = raw.ignoreScopes === undefined ? [] : strings(raw.ignoreScopes, "ignoreScopes", glob);
  const forceFullScopes = raw.forceFullScopes === undefined ? [] : strings(raw.forceFullScopes, "forceFullScopes", glob);
  unique(ignoreScopes, "ignoreScopes"); unique(forceFullScopes, "forceFullScopes");
  const git = object(raw.git, "git"); exact(git, ["base"], "git");
  const gitBase = text(git.base, "git.base");
  if (gitBase.startsWith("-") || /[\u0000-\u0020]/u.test(gitBase) || gitBase.length > 256) {
    throw new FoundationError("git.base must be a safe Git revision without whitespace or leading dash");
  }
  validateReferences(criteria, lanes, proofs);
  return {
    schemaVersion: 1, criteria, lanes, proofs, ignoreScopes, forceFullScopes, gitBase, path, root,
    fingerprint: createHash("sha256").update(json).digest("hex"),
  };
}

export function loadConfig(rootValue = process.cwd(), configValue = "skies.node.json"): FoundationConfig {
  const root = resolve(rootValue);
  const path = resolve(root, configValue);
  const outside = relative(root, path);
  if (outside === ".." || outside.startsWith(`..${sep}`) || isAbsolute(outside)) {
    throw new FoundationError("config path must stay within the workspace root", "invocation");
  }
  let json: string;
  try { json = readFileSync(path, "utf8"); } catch (error) {
    throw new FoundationError(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`, "io");
  }
  return parseConfig(json, path, root);
}
