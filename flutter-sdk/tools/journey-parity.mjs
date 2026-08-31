#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const IGNORED = new Set([".git", ".skies", "bin", "node_modules", "obj", "output", "tmp"]);

/** Derive write slices and co-located happy/sad journeys from ordinary C# sources. */
export function extractBackendJourneyInventory(sources) {
  const slices = new Set();
  const writes = new Set();
  const paths = new Map();
  for (const source of sources) {
    const declarations = [...source.matchAll(/((?:^\s*\[[^\]\r\n]+\]\s*(?:\/\/[^\r\n]*)?\r?\n)+)\s*public\s+static\s+class\s+([A-Za-z_]\w*)/gm)]
      .filter((match) => /\bSlice(?:Attribute)?\b/.test(match[1]));
    for (let index = 0; index < declarations.length; index++) {
      const declaration = declarations[index];
      slices.add(declaration[2]);
      const body = source.slice(declaration.index, declarations[index + 1]?.index ?? source.length);
      if (/\bMap(?:Post|Put|Patch|Delete)\s*\(/.test(body)) writes.add(declaration[2]);
    }
    for (const match of source.matchAll(/\bJourney\s*\(\s*typeof\s*\(\s*([A-Za-z_]\w*)\s*\)\s*,\s*JourneyPath\.(Happy|Sad)\s*\)/g)) {
      const values = paths.get(match[1]) ?? new Set();
      values.add(match[2].toLowerCase());
      paths.set(match[1], values);
    }
  }
  return { slices: [...slices].sort(), writes: [...writes].sort(), paths };
}

/** A configured backend root must contain slices even when it is read-only. */
export function backendInventoryError(inventory) {
  return inventory.slices.length === 0 ? "backend root contains no [Slice] declarations" : null;
}

/** Require both backend journey paths for every write consumed by Flutter E2E. */
export function checkJourneyParity(inventory, flows) {
  const writes = new Set(inventory.writes);
  const uiBound = new Set(flows.flatMap((flow) => flow.backendSlices ?? []).filter((slice) => writes.has(slice)));
  const missing = [];
  for (const slice of [...uiBound].sort()) {
    const proven = inventory.paths.get(slice) ?? new Set();
    const paths = ["happy", "sad"].filter((path) => !proven.has(path));
    if (paths.length > 0) missing.push({ slice, paths });
  }
  return {
    uiBound: [...uiBound].sort(),
    backendOnly: inventory.writes.filter((slice) => !uiBound.has(slice)),
    missing,
    gaps: missing.length,
    messages: missing.map(({ slice, paths }) => `UI-bound write ${slice} lacks backend ${paths.join("+")} journey proof`),
  };
}

function walk(root) {
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((entry) => {
    if (entry.isDirectory() && IGNORED.has(entry.name)) return [];
    const path = join(root, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() && path.endsWith(".cs") ? [path] : [];
  });
}

/** Read the backend journey inventory from a configured API source root. */
export function readBackendJourneyInventory(root) {
  return extractBackendJourneyInventory(walk(root).map((file) => readFileSync(file, "utf8")));
}

const invokedDirectly = process.argv[1] && import.meta.url.split("/").pop() === process.argv[1].replace(/\\/g, "/").split("/").pop();
if (invokedDirectly) {
  const [backendRoot, ...flowFiles] = process.argv.slice(2);
  if (!backendRoot || flowFiles.length === 0 || flowFiles.some((file) => !existsSync(file))) {
    console.error("usage: skies-flutter-journey-parity <backend-root> <flows.json> [...flows.json]");
    process.exitCode = 2;
  } else {
    const flows = flowFiles.flatMap((file) => JSON.parse(readFileSync(file, "utf8")));
    const inventory = readBackendJourneyInventory(backendRoot);
    const inventoryError = backendInventoryError(inventory);
    if (inventoryError) {
      console.error(`SKYFL-JOURNEY ${inventoryError}`);
      process.exitCode = 1;
    } else {
      const result = checkJourneyParity(inventory, flows);
      for (const message of result.messages) console.error(`SKYFL-JOURNEY ${message}`);
      process.exitCode = result.gaps > 0 ? 1 : 0;
    }
  }
}
