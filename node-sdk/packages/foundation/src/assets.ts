import { FoundationError } from "./types.js";
import { normalizeRelativePath } from "./config.js";
import { applyTextPlan, readSafeText, type TextAction, type TextChange } from "./safe-fs.js";

export const FOUNDATION_VERSION = "0.1.0";
export const CSM_CONFIG = "csm.json";
export const INSTRUCTIONS_START = "<!-- skies-node:foundations:start -->";
export const INSTRUCTIONS_END = "<!-- skies-node:foundations:end -->";
const MANAGED = "<!-- managed by @skiesjs/foundation; run `skies-node-foundation foundations sync` -->";

export interface CsmConfig {
  readonly schemaVersion: 1;
  readonly storage: string;
}

export interface FoundationAssetsOptions {
  readonly root: string;
  readonly operation: "init" | "sync";
  readonly dryRun?: boolean;
  readonly agentFiles?: readonly string[];
}

export interface FoundationAssetsResult {
  readonly operation: "init" | "sync";
  readonly dryRun: boolean;
  readonly storage: string;
  readonly actions: readonly TextAction[];
}

function skill(id: "nwc" | "nya" | "rtw" | "wtw", purpose: string, operations: readonly string[]): string {
  return `${MANAGED}
# ${id.toUpperCase()} — ${purpose}

This is the repository-local Node foundation surface. Do not install or invoke an ambient CSM binary.

${operations.map((operation) => `- \`skies-node-foundation ${id} ${operation}\``).join("\n")}
- \`skies-node-foundation context --task "<goal>"\`
- \`skies-node-foundation check --task "<goal>" --affected\`
`;
}

export const FOUNDATION_INSTRUCTIONS = `${INSTRUCTIONS_START}
## Skies Node foundations

Use only the repository-owned foundation assets beneath the storage root declared in \`csm.json\`.
Before implementation, run \`skies-node-foundation context --task "<goal>" --path "<path>"\`.
Before handoff, run one explicitly scoped review:

- \`skies-node-foundation check --task "<goal>" --affected\`
- \`skies-node-foundation check --task "<goal>" --base\`
- \`skies-node-foundation check --task "<goal>" --full\`

A skipped, missing, unknown, or timed-out proof is never a pass. Run foundation commands through
\`skies-node-foundation\`; do not invoke an ambient NWC, NYA, RTW, or WTW installation.
${INSTRUCTIONS_END}`;

function consolidateInstructions(content: string): string {
  const starts = content.split(INSTRUCTIONS_START).length - 1;
  const ends = content.split(INSTRUCTIONS_END).length - 1;
  if (starts !== ends || starts > 1) throw new FoundationError("agent instructions contain malformed foundation markers", "io");
  let outside = content;
  if (starts === 1) {
    const start = outside.indexOf(INSTRUCTIONS_START);
    const end = outside.indexOf(INSTRUCTIONS_END, start) + INSTRUCTIONS_END.length;
    outside = `${outside.slice(0, start)}${outside.slice(end)}`;
  }
  const trimmed = outside.trimEnd();
  return `${trimmed.length === 0 ? "" : `${trimmed}

`}${FOUNDATION_INSTRUCTIONS}
`;
}

function parseCsm(json: string): CsmConfig {
  let value: unknown;
  try { value = JSON.parse(json) as unknown; } catch (error) {
    throw new FoundationError(`cannot parse ${CSM_CONFIG}: ${error instanceof Error ? error.message : String(error)}`, "config");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new FoundationError(`${CSM_CONFIG} must be an object`);
  const raw = value as Record<string, unknown>;
  const unknown = Object.keys(raw).filter((key) => !["schemaVersion", "storage"].includes(key));
  if (unknown.length > 0) throw new FoundationError(`${CSM_CONFIG} has unknown key(s): ${unknown.sort().join(", ")}`);
  if (raw.schemaVersion !== 1 || typeof raw.storage !== "string") throw new FoundationError(`${CSM_CONFIG} requires schemaVersion 1 and a storage string`);
  const storage = normalizeRelativePath(raw.storage, `${CSM_CONFIG}.storage`);
  if (storage === ".") throw new FoundationError(`${CSM_CONFIG}.storage must not be the workspace root`);
  if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u.test(storage)) {
    throw new FoundationError(`${CSM_CONFIG}.storage must be a portable relative directory`);
  }
  return { schemaVersion: 1, storage };
}

export async function loadCsmConfig(root: string): Promise<CsmConfig> {
  const content = await readSafeText(root, CSM_CONFIG);
  if (content === undefined) throw new FoundationError(`${CSM_CONFIG} is missing; run foundations init`, "config");
  return parseCsm(content);
}

function managedAssets(storage: string): readonly { path: string; content: string }[] {
  const keep = `${MANAGED}
`;
  return [
    { path: `${storage}/.gitignore`, content: `# managed by @skiesjs/foundation
**/index*.sqlite
` },
    { path: `${storage}/lock.json`, content: `${JSON.stringify({ schemaVersion: 1, managedBy: "@skiesjs/foundation", version: FOUNDATION_VERSION }, null, 2)}
` },
    { path: `${storage}/nya/config.json`, content: `${JSON.stringify({ schemaVersion: 1 }, null, 2)}
` },
    { path: `${storage}/nwc/SKILL.md`, content: skill("nwc", "next work and deferments", ["wake", "collect", "resolve", "check"]) },
    { path: `${storage}/nya/SKILL.md`, content: skill("nya", "corrected scars and lessons", ["recall", "spec", "check", "replay"]) },
    { path: `${storage}/rtw/SKILL.md`, content: skill("rtw", "repository ways and guidance", ["guide", "add", "check"]) },
    { path: `${storage}/wtw/SKILL.md`, content: skill("wtw", "decisions and invariants", ["explain", "collect", "guard"]) },
    { path: `${storage}/nwc/deferments/.gitkeep`, content: keep },
    { path: `${storage}/nya/scars/.gitkeep`, content: keep },
    { path: `${storage}/rtw/ways/.gitkeep`, content: keep },
    { path: `${storage}/wtw/records/decisions/.gitkeep`, content: keep },
    { path: `${storage}/wtw/records/invariants/.gitkeep`, content: keep },
  ];
}

export interface FoundationTextFile {
  readonly path: string;
  readonly content: string;
}

/** Canonical foundation files for a newly generated empty application, before any local records exist. */
export function defaultFoundationFiles(): readonly FoundationTextFile[] {
  const config = { schemaVersion: 1 as const, storage: ".skies/csm" };
  return [
    { path: CSM_CONFIG, content: `${JSON.stringify(config, null, 2)}
` },
    ...managedAssets(config.storage),
    { path: "AGENTS.md", content: `${FOUNDATION_INSTRUCTIONS}
` },
  ];
}

async function agentTargets(root: string, selected?: readonly string[]): Promise<string[]> {
  let files: string[];
  if (selected === undefined || selected.length === 0) {
    const detected: string[] = [];
    for (const candidate of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
      if (await readSafeText(root, candidate) !== undefined) detected.push(candidate);
    }
    files = detected.length === 0 ? ["AGENTS.md"] : detected;
  } else files = selected.map((file, index) => normalizeRelativePath(file, `agentFiles[${index}]`));
  const deduplicated: string[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const key = file.toLowerCase();
    if (!seen.has(key)) { seen.add(key); deduplicated.push(file); }
  }
  if (!deduplicated.some((file) => !file.includes("/") && /^(agents|claude|gemini)\.md$/iu.test(file))) deduplicated.push("AGENTS.md");
  for (const file of deduplicated) {
    if (!file.toLowerCase().endsWith(".md")) throw new FoundationError(`agent file '${file}' must be Markdown`, "invocation");
    if (!/^[A-Za-z0-9._/-]+$/u.test(file)) throw new FoundationError(`agent file '${file}' is not a portable path`, "invocation");
  }
  return deduplicated;
}

export async function installFoundationAssets(options: FoundationAssetsOptions): Promise<FoundationAssetsResult> {
  const existingConfig = await readSafeText(options.root, CSM_CONFIG);
  const config = existingConfig === undefined ? { schemaVersion: 1 as const, storage: ".skies/csm" } : parseCsm(existingConfig);
  const changes: TextChange[] = [{
    path: CSM_CONFIG,
    content: existingConfig ?? `${JSON.stringify(config, null, 2)}
`,
    overwrite: false,
  }];
  for (const asset of managedAssets(config.storage)) {
    const current = await readSafeText(options.root, asset.path);
    if (options.operation === "sync" && current !== undefined && current !== asset.content) {
      const owned = current.includes("managed by @skiesjs/foundation")
        || current.includes('"managedBy": "@skiesjs/foundation"')
        || asset.path.endsWith("/lock.json")
        || asset.path.endsWith("nya/config.json");
      if (!owned) throw new FoundationError(`refusing to replace unmanaged asset '${asset.path}'`, "io");
    }
    changes.push({ ...asset, overwrite: options.operation === "sync" });
  }
  for (const file of await agentTargets(options.root, options.agentFiles)) {
    const current = await readSafeText(options.root, file) ?? "";
    changes.push({ path: file, content: consolidateInstructions(current), overwrite: true });
  }
  const actions = await applyTextPlan(options.root, changes, options.dryRun ?? false);
  return { operation: options.operation, dryRun: options.dryRun ?? false, storage: config.storage, actions };
}

export async function checkFoundationAssets(root: string): Promise<readonly string[]> {
  const findings: string[] = [];
  let config: CsmConfig;
  try { config = await loadCsmConfig(root); } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  for (const asset of managedAssets(config.storage)) {
    const current = await readSafeText(root, asset.path);
    if (current === undefined) findings.push(`missing foundation asset '${asset.path}'`);
    else if (current !== asset.content) findings.push(`outdated foundation asset '${asset.path}'`);
  }
  const agents = await agentTargets(root);
  if (agents.length === 0) findings.push("no root agent instruction file is installed");
  for (const file of agents) {
    const current = await readSafeText(root, file);
    if (current === undefined || !current.includes(FOUNDATION_INSTRUCTIONS)) findings.push(`agent file '${file}' lacks the current foundation protocol`);
  }
  return findings;
}
