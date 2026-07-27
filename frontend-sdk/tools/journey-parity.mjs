#!/usr/bin/env node
// Journey parity derives both sides from inventories. Backend write shape identifies which slices owe happy+sad
// journeys; frontend flows identify which of those writes have a UI surface through backendSlices. A backend-only
// write stays backend-only. A UI-bound write must have both backend paths, with no file-name link for an agent to
// omit or redirect.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const IGNORED_DIRECTORIES = new Set([".git", ".skies", "bin", "node_modules", "obj", "output", "tmp"]);

/** Derive write slices and their executable journey paths from ordinary C# sources. */
export function extractBackendJourneyInventory(sources) {
  const slices = new Set();
  const writes = new Set();
  const paths = new Map();
  for (const source of sources) {
    const declarations = [...source.matchAll(
      /((?:^\s*\[[^\]\r\n]+\]\s*(?:\/\/[^\r\n]*)?\r?\n)+)\s*public\s+static\s+class\s+([A-Za-z_]\w*)/gm,
    )].filter((match) => /\bSlice(?:Attribute)?\b/.test(match[1]));
    for (let index = 0; index < declarations.length; index++) {
      const declaration = declarations[index];
      slices.add(declaration[2]);
      const body = source.slice(declaration.index, declarations[index + 1]?.index ?? source.length);
      if (/\bMap(?:Post|Put|Patch|Delete)\s*\(/.test(body)) writes.add(declaration[2]);
    }

    for (const match of source.matchAll(
      /\bJourney\s*\(\s*typeof\s*\(\s*([A-Za-z_]\w*)\s*\)\s*,\s*JourneyPath\.(Happy|Sad)\s*\)/g,
    )) {
      const slicePaths = paths.get(match[1]) ?? new Set();
      slicePaths.add(match[2].toLowerCase());
      paths.set(match[1], slicePaths);
    }
  }
  return { slices: [...slices].sort(), writes: [...writes].sort(), paths };
}

/** A configured backend root must contain slices; zero writes is valid only for a genuinely read-only API. */
export function backendInventoryError(inventory) {
  return inventory.slices.length === 0
    ? "backend root contains no [Slice] declarations — point journey parity at the API source root, not a tests/journeys leaf"
    : null;
}

/**
 * Check the derived full-stack seam. Backend-only writes are reported but valid; UI-bound writes require both
 * backend paths. Frontend execution of each backendSlices entry is owned by e2e-doctor.
 */
export function checkJourneyParity(inventory, frontendFlows) {
  const writes = new Set(inventory.writes);
  const uiBound = new Set();
  for (const flow of frontendFlows) {
    for (const slice of flow.backendSlices ?? []) {
      if (writes.has(slice)) uiBound.add(slice);
    }
  }

  const missing = [];
  for (const slice of [...uiBound].sort()) {
    const proven = inventory.paths.get(slice) ?? new Set();
    const missingPaths = ["happy", "sad"].filter((path) => !proven.has(path));
    if (missingPaths.length > 0) missing.push({ slice, paths: missingPaths });
  }
  const backendOnly = inventory.writes.filter((slice) => !uiBound.has(slice));
  const messages = missing.map(
    ({ slice, paths }) => `UI-bound write slice "${slice}" lacks backend ${paths.join("+")} journey proof`,
  );
  return {
    uiBound: [...uiBound].sort(),
    backendOnly,
    missing,
    gaps: missing.length,
    messages,
  };
}

/** Parse and combine independently-gated surface manifests for one shared backend. */
export function parseFlowManifests(manifests) {
  return manifests.flatMap(({ path, content }) => {
    const flows = JSON.parse(content);
    if (!Array.isArray(flows)) throw new Error(`${path}: flows manifest must be an array`);
    return flows;
  });
}

function walk(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) return [];
    const path = join(root, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() && path.endsWith(".cs") ? [path] : [];
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , backendRoot, ...flowsFiles] = process.argv;
  if (!backendRoot || flowsFiles.length === 0) {
    console.error("usage: skyfe-journey-parity <backend-root> <flows.json> [...more-flows.json]");
    process.exit(2);
  }
  const missingFiles = flowsFiles.filter((flowsFile) => !existsSync(flowsFile));
  if (missingFiles.length > 0) {
    console.log(`SKYFE-JOURNEY: frontend flows manifest not found: ${missingFiles.join(", ")} — parity cannot be proven.`);
    process.exit(1);
  }

  let frontendFlows;
  try {
    frontendFlows = parseFlowManifests(
      flowsFiles.map((flowsFile) => ({ path: flowsFile, content: readFileSync(flowsFile, "utf8") })),
    );
  } catch (error) {
    console.log(`SKYFE-JOURNEY: flows manifest invalid — ${error.message}`);
    process.exit(1);
  }

  const inventory = extractBackendJourneyInventory(walk(backendRoot).map((file) => readFileSync(file, "utf8")));
  const inventoryError = backendInventoryError(inventory);
  if (inventoryError) {
    console.log(`SKYFE-JOURNEY: ${inventoryError}.`);
    process.exit(1);
  }
  const result = checkJourneyParity(inventory, frontendFlows);
  console.log(
    `SKYFE-JOURNEY: ${inventory.writes.length} backend write slice(s), ${result.uiBound.length} UI-bound, `
      + `${result.backendOnly.length} backend-only, ${result.gaps} parity gap(s).`,
  );
  for (const message of result.messages) console.log(`  - ${message}`);
  process.exit(result.gaps > 0 ? 1 : 0);
}
