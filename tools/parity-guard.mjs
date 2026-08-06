#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SIDES = ["dotnet", "node"];
const PARITY = new Set(["equivalent", "wire-compatible", "adapter-specific"]);
const PROOF_KINDS = new Set(["build", "doctor", "integration", "journey", "mutation", "package-smoke", "test", "wire-fixture"]);
const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const TOP_KEYS = ["$schema", "schemaVersion", "policy", "sharedContracts", "capabilities", "diagnostics", "deferments"];
const DIAGNOSTIC_KINDS = new Set(["diagnostic", "explicit-api", "language", "generator"]);
const posix = path => String(path).replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\//, "");

export function globToRegExp(pattern) {
  const parts = posix(pattern).split("/");
  let source = "^";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "**") source += i === parts.length - 1 ? ".*" : "(?:[^/]+/)*";
    else {
      for (const char of part) {
        if (char === "*") source += "[^/]*";
        else source += /[\\^$+?.()|{}\[\]]/.test(char) ? `\\${char}` : char;
      }
      if (i < parts.length - 1) source += "/";
    }
  }
  return new RegExp(source + "$");
}

export function matchesGlob(path, pattern) {
  return globToRegExp(pattern).test(posix(path));
}

export function expandGlob(pattern, files) {
  return files.map(posix).filter(path => matchesGlob(path, pattern)).sort();
}

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function closed(value, keys, at, errors) {
  if (!object(value)) { errors.push(`${at} must be an object`); return false; }
  for (const key of keys) if (!own(value, key)) errors.push(`${at} is missing ${key}`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(`${at} has unknown key ${key}`);
  return true;
}
function string(value, at, errors, pattern) {
  if (typeof value !== "string" || value.length === 0) errors.push(`${at} must be a non-empty string`);
  else if (pattern && !pattern.test(value)) errors.push(`${at} has an invalid value`);
}
function strings(value, at, errors, { nonempty = false, sorted = false } = {}) {
  if (!Array.isArray(value)) { errors.push(`${at} must be an array`); return; }
  if (nonempty && value.length === 0) errors.push(`${at} must not be empty`);
  value.forEach((item, i) => string(item, `${at}[${i}]`, errors));
  if (new Set(value).size !== value.length) errors.push(`${at} must contain unique values`);
  if (sorted && value.some((v, i) => i && String(value[i - 1]).localeCompare(String(v)) > 0)) errors.push(`${at} must be sorted`);
}
function expandRequired(pattern, at, files, errors) {
  if (typeof pattern === "string" && pattern && expandGlob(pattern, files).length === 0)
    errors.push(`${at} does not match a real file: ${pattern}`);
}

/** Closed, dependency-free schema and repository validation. */
export function validateManifest(manifest, files = []) {
  const errors = [];
  files = files.map(posix);
  if (!closed(manifest, TOP_KEYS, "manifest", errors)) return errors;
  string(manifest.$schema, "manifest.$schema", errors);
  if (manifest.schemaVersion !== 1) errors.push("manifest.schemaVersion must be 1");
  if (closed(manifest.policy, ["behaviorPatterns", "ignoredBehavior"], "policy", errors)) {
    if (closed(manifest.policy.behaviorPatterns, SIDES, "policy.behaviorPatterns", errors))
      for (const side of SIDES) strings(manifest.policy.behaviorPatterns[side], `policy.behaviorPatterns.${side}`, errors, { nonempty: true });
    strings(manifest.policy.ignoredBehavior, "policy.ignoredBehavior", errors);
  }
  if (!Array.isArray(manifest.sharedContracts)) errors.push("sharedContracts must be an array");
  else manifest.sharedContracts.forEach((contract, i) => {
    const at = `sharedContracts[${i}]`;
    if (!closed(contract, ["id", "path", "consumers"], at, errors)) return;
    string(contract.id, `${at}.id`, errors, ID); string(contract.path, `${at}.path`, errors);
    expandRequired(contract.path, `${at}.path`, files, errors);
    if (closed(contract.consumers, SIDES, `${at}.consumers`, errors)) for (const side of SIDES) {
      strings(contract.consumers[side], `${at}.consumers.${side}`, errors, { nonempty: true });
      const consumers = Array.isArray(contract.consumers[side]) ? contract.consumers[side] : [];
      for (const [j, pattern] of consumers.entries()) expandRequired(pattern, `${at}.consumers.${side}[${j}]`, files, errors);
    }
  });
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) errors.push("capabilities must be a non-empty array");
  else manifest.capabilities.forEach((capability, i) => {
    const at = `capabilities[${i}]`;
    if (!closed(capability, ["id", "statement", "parity", ...SIDES, "sharedContracts"], at, errors)) return;
    string(capability.id, `${at}.id`, errors, ID); string(capability.statement, `${at}.statement`, errors);
    if (!PARITY.has(capability.parity)) errors.push(`${at}.parity is invalid`);
    strings(capability.sharedContracts, `${at}.sharedContracts`, errors, { sorted: true });
    for (const side of SIDES) if (closed(capability[side], ["scopes", "proofs"], `${at}.${side}`, errors)) {
      strings(capability[side].scopes, `${at}.${side}.scopes`, errors, { nonempty: true });
      const scopes = Array.isArray(capability[side].scopes) ? capability[side].scopes : [];
      for (const [j, pattern] of scopes.entries()) expandRequired(pattern, `${at}.${side}.scopes[${j}]`, files, errors);
      const proofs = capability[side].proofs;
      if (!Array.isArray(proofs) || proofs.length === 0) errors.push(`${at}.${side}.proofs must be a non-empty array`);
      else proofs.forEach((proof, j) => {
        const pat = `${at}.${side}.proofs[${j}]`;
        if (!closed(proof, ["kind", "path"], pat, errors)) return;
        if (!PROOF_KINDS.has(proof.kind)) errors.push(`${pat}.kind is invalid`);
        string(proof.path, `${pat}.path`, errors); expandRequired(proof.path, `${pat}.path`, files, errors);
      });
    }
  });
  if (!Array.isArray(manifest.diagnostics)) errors.push("diagnostics must be an array");
  else manifest.diagnostics.forEach((diagnostic, i) => {
    const at = `diagnostics[${i}]`;
    if (!closed(diagnostic, ["dotnet", "node", "capability"], at, errors)) return;
    string(diagnostic.dotnet, `${at}.dotnet`, errors, /^SKY\d{4}$/);
    string(diagnostic.capability, `${at}.capability`, errors);
    if (closed(diagnostic.node, ["kind", "value"], `${at}.node`, errors)) {
      if (!DIAGNOSTIC_KINDS.has(diagnostic.node.kind)) errors.push(`${at}.node.kind is invalid`);
      string(diagnostic.node.value, `${at}.node.value`, errors);
      if (diagnostic.node.kind === "diagnostic" && typeof diagnostic.node.value === "string" && !/^SKYN\d{4}$/.test(diagnostic.node.value))
        errors.push(`${at}.node.value must be an SKYN diagnostic ID`);
    }
  });
  if (!Array.isArray(manifest.deferments)) errors.push("deferments must be an array");
  else manifest.deferments.forEach((deferment, i) => {
    const at = `deferments[${i}]`;
    if (!closed(deferment, ["id", "capability", "side", "reason", "owner", "expires"], at, errors)) return;
    for (const key of ["id", "capability", "reason", "owner", "expires"]) string(deferment[key], `${at}.${key}`, errors);
    if (!SIDES.includes(deferment.side)) errors.push(`${at}.side is invalid`);
    if (typeof deferment.expires === "string") {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deferment.expires);
      const date = match && new Date(`${deferment.expires}T00:00:00Z`);
      if (!match || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== deferment.expires)
        errors.push(`${at}.expires must be an ISO date`);
    }
  });
  const uniqueSorted = (items, name) => {
    if (!Array.isArray(items)) return;
    const ids = items.map(item => item?.id);
    if (new Set(ids).size !== ids.length) errors.push(`${name} IDs must be unique`);
    if (ids.some((id, i) => i && String(ids[i - 1]).localeCompare(String(id)) > 0)) errors.push(`${name} IDs must be sorted`);
  };
  uniqueSorted(manifest.capabilities, "capability"); uniqueSorted(manifest.sharedContracts, "shared contract"); uniqueSorted(manifest.deferments, "deferment");
  if (Array.isArray(manifest.diagnostics)) {
    const dotnetIds = manifest.diagnostics.map(d => d?.dotnet);
    if (new Set(dotnetIds).size !== dotnetIds.length) errors.push("diagnostic dotnet IDs must be unique");
    if (dotnetIds.some((id, i) => i && String(dotnetIds[i - 1]).localeCompare(String(id)) > 0)) errors.push("diagnostics must be sorted by dotnet ID");
    const nodeIds = manifest.diagnostics.filter(d => d?.node?.kind === "diagnostic").map(d => d.node.value);
    if (new Set(nodeIds).size !== nodeIds.length) errors.push("diagnostic node IDs must be unique");
  }
  const caps = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
  const shared = Array.isArray(manifest.sharedContracts) ? manifest.sharedContracts : [];
  const deferments = Array.isArray(manifest.deferments) ? manifest.deferments : [];
  const capabilities = new Set(caps.map(c => c?.id));
  const contracts = new Set(shared.map(c => c?.id));
  const diagnostics = Array.isArray(manifest.diagnostics) ? manifest.diagnostics : [];
  for (const [i, diagnostic] of diagnostics.entries()) if (!capabilities.has(diagnostic?.capability))
    errors.push(`diagnostics[${i}] references unknown capability ${diagnostic?.capability}`);
  for (const [i, capability] of caps.entries()) {
    const references = Array.isArray(capability?.sharedContracts) ? capability.sharedContracts : [];
    for (const id of references) if (!contracts.has(id)) errors.push(`capabilities[${i}].sharedContracts references unknown contract ${id}`);
  }
  for (const [i, contract] of shared.entries())
    if (!caps.some(c => c?.sharedContracts?.includes(contract?.id))) errors.push(`sharedContracts[${i}] is not referenced by a capability`);
  for (const [i, deferment] of deferments.entries()) if (!capabilities.has(deferment?.capability))
    errors.push(`deferments[${i}] references unknown capability ${deferment?.capability}`);
  return errors;
}

export function explainPath(manifest, path) {
  path = posix(path);
  const policyPatterns = side => Array.isArray(manifest.policy?.behaviorPatterns?.[side]) ? manifest.policy.behaviorPatterns[side] : [];
  const ignoredPatterns = Array.isArray(manifest.policy?.ignoredBehavior) ? manifest.policy.ignoredBehavior : [];
  const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
  const behaviorSides = SIDES.filter(side => policyPatterns(side).some(p => matchesGlob(path, p)));
  const ignored = ignoredPatterns.some(p => matchesGlob(path, p));
  const mappings = [];
  for (const capability of capabilities) for (const side of SIDES) {
    const scopes = (Array.isArray(capability?.[side]?.scopes) ? capability[side].scopes : []).filter(p => matchesGlob(path, p));
    const proofs = (Array.isArray(capability?.[side]?.proofs) ? capability[side].proofs : []).map(p => p?.path).filter(p => typeof p === "string" && matchesGlob(path, p));
    const patterns = [...scopes, ...proofs];
    if (patterns.length) mappings.push({ capability: capability.id, side, patterns, scopes, proofs });
  }
  return { path, behaviorSides, ignored, mappings };
}

export function validateInventory(manifest, files) {
  const errors = [];
  for (const path of files.map(posix).sort()) {
    const info = explainPath(manifest, path);
    for (const side of info.behaviorSides) if (!info.ignored && !info.mappings.some(m => m.side === side))
      errors.push(`unmapped ${side} behavior: ${path}`);
  }
  return errors;
}

export function checkDrift(manifest, changedPaths, today = new Date().toISOString().slice(0, 10)) {
  const errors = [], affected = new Map();
  for (const path of [...new Set(changedPaths.map(posix))].sort()) {
    const info = explainPath(manifest, path);
    if (info.behaviorSides.length && !info.ignored && !info.mappings.some(m => info.behaviorSides.includes(m.side))) {
      errors.push(`changed behavior is unmapped: ${path}`); continue;
    }
    for (const mapping of info.mappings) if (mapping.scopes.length) {
      if (!affected.has(mapping.capability)) affected.set(mapping.capability, new Set());
      affected.get(mapping.capability).add(mapping.side);
    }
  }
  for (const [capability, sides] of affected) if (sides.size === 1) {
    const missing = SIDES.find(side => !sides.has(side));
    const deferments = Array.isArray(manifest.deferments) ? manifest.deferments : [];
    const deferment = deferments.find(d => d?.capability === capability && d.side === missing && d.expires >= today);
    if (!deferment) errors.push(`unilateral drift for ${capability}: missing ${missing} change`);
  }
  return errors;
}

export async function walkFiles(root) {
  const out = [];
  async function walk(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(resolve(directory, entry.name), path);
      else if (entry.isFile()) out.push(path);
    }
  }
  await walk(root); return out.sort();
}
function git(root, args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status && !allowFailure) throw new Error((result.stderr || `git ${args.join(" ")} failed`).trim());
  return result.status ? [] : result.stdout.split(/\r?\n/).filter(Boolean).map(posix);
}
export function inventoryFiles(root) {
  return [...new Set(git(root, ["ls-files", "--cached", "--others", "--exclude-standard"]).filter(path => {
    try { return statSync(resolve(root, path)).isFile(); } catch { return false; }
  }))].sort();
}

export function bootstrapChangedPaths(changedPaths, baseHasManifest) {
  return baseHasManifest ? [...new Set(changedPaths.map(posix))].sort() : ["parity/skies.parity.json"];
}
function gitObjectExists(root, object) {
  return spawnSync("git", ["cat-file", "-e", object], { cwd: root, encoding: "utf8" }).status === 0;
}
function changesFromBase(root, base, tripleDot = false) {
  const hasManifest = gitObjectExists(root, `${base}:parity/skies.parity.json`);
  if (!hasManifest) return bootstrapChangedPaths([], false);
  const range = tripleDot ? `${base}...HEAD` : [base, "HEAD"];
  const args = ["diff", "--name-only", ...(Array.isArray(range) ? range : [range])];
  return bootstrapChangedPaths(git(root, args, true), true);
}

export function discoverChangedPaths(root, { changed = [], base, ci = false, env = process.env } = {}) {
  if (changed.length) return [...new Set(changed.map(posix))].sort();
  if (ci && !base && env.GITHUB_EVENT_PATH) {
    try {
      const event = JSON.parse(requireRead(env.GITHUB_EVENT_PATH));
      base = event.pull_request?.base?.sha ?? event.before;
    } catch { /* use fallback */ }
  }
  if (base) return changesFromBase(root, base, true);
  if (ci) return changesFromBase(root, "HEAD^");
  if (!gitObjectExists(root, "HEAD:parity/skies.parity.json")) return bootstrapChangedPaths([], false);
  const local = [...git(root, ["diff", "--name-only", "HEAD"], true), ...git(root, ["ls-files", "--others", "--exclude-standard"], true)];
  if (local.length) return [...new Set(local)].sort();
  return changesFromBase(root, "HEAD^");
}
function requireRead(path) { return readFileSync(path, "utf8"); }

export async function loadManifest(root) {
  return JSON.parse(await readFile(resolve(root, "parity/skies.parity.json"), "utf8"));
}
function parseArgs(argv) {
  const args = [...argv]; let command = "check";
  if (["check", "list", "explain"].includes(args[0])) command = args.shift();
  const options = { changed: [], json: false, ci: false }; let target;
  while (args.length) {
    const arg = args.shift();
    if (arg === "--json") options.json = true;
    else if (arg === "--ci") options.ci = true;
    else if (arg === "--changed") { if (!args.length) throw new Error("--changed needs a path"); options.changed.push(args.shift()); }
    else if (arg.startsWith("--changed=")) options.changed.push(arg.slice(10));
    else if (arg === "--base") { if (!args.length) throw new Error("--base needs a ref"); options.base = args.shift(); }
    else if (arg.startsWith("--base=")) options.base = arg.slice(7);
    else if (command === "explain" && target === undefined) target = arg;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (command === "explain" && target === undefined) throw new Error("explain needs a path");
  return { command, options, target };
}

export async function runCli(argv = process.argv.slice(2), { root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), stdout = console.log, stderr = console.error } = {}) {
  try {
    const { command, options, target } = parseArgs(argv);
    const manifest = await loadManifest(root);
    const tracked = inventoryFiles(root);
    const validation = validateManifest(manifest, tracked);
    if (command === "list") {
      const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
      const result = capabilities.map(({ id, parity, statement }) => ({ id, parity, statement }));
      stdout(options.json ? JSON.stringify(result, null, 2) : result.map(c => `${c.id}\t${c.parity}\t${c.statement}`).join("\n"));
      return validation.length ? 1 : 0;
    }
    if (command === "explain") {
      const result = explainPath(manifest, target);
      stdout(options.json ? JSON.stringify(result, null, 2) : [result.path, `behavior: ${result.behaviorSides.join(", ") || "no"}`, `ignored: ${result.ignored}`, ...result.mappings.map(m => `${m.capability} (${m.side}): ${m.patterns.join(", ")}`)].join("\n"));
      return validation.length ? 1 : 0;
    }
    const changed = discoverChangedPaths(root, options);
    const errors = validation.length ? validation : [...validateInventory(manifest, tracked), ...checkDrift(manifest, changed)];
    const result = { ok: errors.length === 0, errors, changed };
    if (options.json) stdout(JSON.stringify(result, null, 2));
    else if (result.ok) stdout(`Parity guard passed (${changed.length} changed path${changed.length === 1 ? "" : "s"}).`);
    else stderr([`Parity guard failed with ${errors.length} error${errors.length === 1 ? "" : "s"}:`, ...errors.map(e => `- ${e}`)].join("\n"));
    return result.ok ? 0 : 1;
  } catch (error) { stderr(`Parity guard error: ${error.message}`); return 2; }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await runCli();
