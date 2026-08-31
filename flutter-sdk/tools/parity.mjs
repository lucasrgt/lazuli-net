#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SKYFL_RULES } from "./doctor.mjs";

/** Audit every declared runtime, tool, proof, and SKYFE-to-SKYFL rule slot. */
export function checkFlutterReactParity({ sdkRoot, repositoryRoot }) {
  const manifestPath = join(sdkRoot, "parity", "flutter-react.parity.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const gaps = [];
  const runtimeRoot = join(sdkRoot, "packages", "skies_flutter");
  for (const item of manifest.runtime) {
    if (!existsSync(join(repositoryRoot, item.reactSource))) gaps.push(`${item.id}: React source is missing`);
    if (!existsSync(join(runtimeRoot, item.source))) gaps.push(`${item.id}: Flutter runtime source is missing`);
    if (!existsSync(join(runtimeRoot, item.proof))) gaps.push(`${item.id}: Flutter runtime proof is missing`);
  }
  for (const item of manifest.tools) {
    if (!existsSync(join(repositoryRoot, item.reactSource))) gaps.push(`${item.id}: React tool is missing`);
    if (!existsSync(join(sdkRoot, item.flutter))) gaps.push(`${item.id}: Flutter tool is missing`);
    if (!existsSync(join(sdkRoot, item.proof))) gaps.push(`${item.id}: Flutter tool proof is missing`);
  }
  for (const item of manifest.ecosystemExclusives ?? []) {
    if (!existsSync(join(sdkRoot, item.proof))) gaps.push(`${item.id}: ecosystem-specific proof is missing`);
  }
  const toolIds = manifest.tools.map((item) => item.id);
  if (new Set(toolIds).size !== toolIds.length) gaps.push("Flutter tool parity contains duplicate IDs");
  const declaredReactTools = new Set(manifest.tools.map((item) => item.reactSource.replace(/\\/g, "/")));
  const shippedReactTools = readdirSync(join(repositoryRoot, "frontend-sdk", "tools"))
    .filter((file) => file.endsWith(".mjs"))
    .map((file) => `frontend-sdk/tools/${file}`);
  for (const tool of shippedReactTools) if (!declaredReactTools.has(tool)) gaps.push(`${tool}: shipped React tool has no Flutter mapping`);

  const docs = readFileSync(join(repositoryRoot, "docs", "FRONTEND-CONVENTIONS.md"), "utf8");
  const sourceIds = new Set([...docs.matchAll(/`SKYFE(\d{3})`/g)].map((match) => Number(match[1])));
  const targetIds = new Set(SKYFL_RULES.map((entry) => Number(entry.code.slice(-3))));
  for (let id = manifest.rules.first; id <= manifest.rules.last; id++) {
    if (!sourceIds.has(id)) gaps.push(`SKYFE${String(id).padStart(3, "0")}: missing from authoritative React convention`);
    if (!targetIds.has(id)) gaps.push(`SKYFL${String(id).padStart(3, "0")}: missing from Flutter doctor catalog`);
  }
  const shippedRules = join(repositoryRoot, "frontend-sdk", "tools", "doctor.mjs");
  if (existsSync(shippedRules)) {
    const shippedIds = new Set([...readFileSync(shippedRules, "utf8").matchAll(/"SKYFE(\d{3})"/g)].map((match) => Number(match[1])));
    for (const id of shippedIds) if (!targetIds.has(id)) gaps.push(`SKYFE${String(id).padStart(3, "0")}: shipped React rule has no Flutter slot`);
  }
  if (targetIds.size !== manifest.rules.last - manifest.rules.first + 1) gaps.push("Flutter rule catalog contains duplicates or out-of-band IDs");
  return { manifest, gaps, ok: gaps.length === 0 };
}

const invokedDirectly = process.argv[1] && import.meta.url.split("/").pop() === process.argv[1].replace(/\\/g, "/").split("/").pop();
if (invokedDirectly) {
  const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const result = checkFlutterReactParity({ sdkRoot, repositoryRoot: resolve(sdkRoot, "..") });
  for (const gap of result.gaps) console.error(`Flutter/React parity: ${gap}`);
  if (result.ok) console.log(`Flutter/React parity: PASS (${result.manifest.runtime.length} runtime capabilities, ${result.manifest.tools.length} tools, 35 rules)`);
  process.exitCode = result.ok ? 0 : 1;
}
