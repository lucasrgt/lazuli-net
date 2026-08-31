#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const FLOW_FIELDS = new Set(["id", "name", "features", "criteria", "path", "target", "spec", "terminal", "backendSlices", "backendContract", "backendOutcome"]);

/** Validate Flutter's canonical integration_test inventory and real-backend execution depth. */
export function checkE2e(root, flows, packageJson) {
  const project = resolve(root);
  const gaps = [];
  if (!Array.isArray(flows) || flows.length === 0) return { gaps: ["SKYFL035 e2e/flows.json must contain at least one flow"], ok: false };
  const ids = new Set();
  for (const flow of flows) {
    const unknown = Object.keys(flow).filter((key) => !FLOW_FIELDS.has(key));
    if (unknown.length > 0) gaps.push(`${flow.id ?? "<unknown>"}: unsupported fields ${unknown.join(", ")}`);
    if (!flow.id || ids.has(flow.id)) gaps.push(`${flow.id ?? "<unknown>"}: id is missing or duplicated`);
    ids.add(flow.id);
    if (flow.target !== "native") gaps.push(`${flow.id}: Flutter flows use target native`);
    if (!["happy", "sad"].includes(flow.path)) gaps.push(`${flow.id}: path must be happy or sad`);
    if (!Array.isArray(flow.features) || flow.features.length !== 1) gaps.push(`${flow.id}: flow must own exactly one feature`);
    if (!Array.isArray(flow.criteria) || flow.criteria.length === 0) gaps.push(`${flow.id}: criteria evidence is empty`);
    if (!flow.terminal) gaps.push(`${flow.id}: terminal evidence is missing`);
    const spec = typeof flow.spec === "string" ? join(project, flow.spec) : "";
    if (!spec || !existsSync(spec) || extname(spec) !== ".dart" || !relative(project, spec).replace(/\\/g, "/").startsWith("integration_test/")) {
      gaps.push(`${flow.id}: Flutter integration_test spec does not exist`);
      continue;
    }
    const source = readFileSync(spec, "utf8");
    if (!/IntegrationTestWidgetsFlutterBinding\.ensureInitialized\s*\(\s*\)/.test(source) || !/\btestWidgets\s*\(/.test(source)) {
      gaps.push(`${flow.id}: spec is not an executable Flutter integration test`);
    }
    if (!assertsVisibleEvidence(source, flow.terminal)) gaps.push(`${flow.id}: integration test does not assert terminal ${flow.terminal}`);
    for (const criterion of flow.criteria ?? []) {
      if (!criterion?.id || !criterion?.evidence || !assertsVisibleEvidence(source, criterion.evidence)) {
        gaps.push(`${flow.id}: criterion ${criterion?.id ?? "<unknown>"} lacks distinct visible evidence`);
      }
    }
    if (/\bskip\s*:\s*(?:true|['"])|@Skip\b|\bsoloTestWidgets\s*\(/.test(source)) gaps.push(`${flow.id}: integration proof is disabled`);
    if ((flow.backendSlices?.length ?? 0) > 0) {
      const contract = flow.backendContract ? join(project, flow.backendContract) : "";
      if (!contract || !existsSync(contract)) gaps.push(`${flow.id}: backendContract is required for backendSlices`);
      if (!/BackendLedgerInterceptor\s*\(|\.expectSlices\s*\(/.test(source)) gaps.push(`${flow.id}: real backend ledger is not asserted`);
      for (const slice of flow.backendSlices ?? []) if (!source.includes(slice)) gaps.push(`${flow.id}: backend slice ${slice} is not asserted by the ledger`);
      const outcome = flow.backendOutcome ?? (flow.path === "happy" ? "success" : "error");
      if (!["success", "error"].includes(outcome)) gaps.push(`${flow.id}: backendOutcome must be success or error`);
      else if (!new RegExp(`BackendOutcome\\s*\\.\\s*${outcome}\\b`).test(source)) gaps.push(`${flow.id}: backend ledger does not assert ${outcome} outcome`);
    }
  }
  const e2eScript = packageJson?.scripts?.["test:e2e"] ?? "";
  if (!/(?:^|&&|;)\s*flutter\s+test\s+integration_test(?:\s|$)/.test(e2eScript) || /--plain-name|--tags|--exclude-tags/.test(e2eScript)) {
    gaps.push("package.json test:e2e must run unfiltered `flutter test integration_test`");
  }
  return { gaps, ok: gaps.length === 0 };
}

function assertsVisibleEvidence(source, evidence) {
  if (typeof evidence !== "string" || evidence.length === 0) return false;
  const quoted = `['\"]${escape(evidence)}['\"]`;
  const finder = `find\\s*\\.\\s*(?:byKey\\s*\\(\\s*(?:const\\s+)?Key\\s*\\(\\s*${quoted}|text\\s*\\(\\s*${quoted})`;
  return new RegExp(`\\b(?:expect|expectLater)\\s*\\([^;]{0,500}${finder}`, "s").test(source);
}

function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Read and validate the conventional Flutter E2E files. */
export function checkE2eProject(root) {
  const flowsPath = join(root, "e2e", "flows.json");
  const packagePath = join(root, "package.json");
  const flows = existsSync(flowsPath) ? JSON.parse(readFileSync(flowsPath, "utf8")) : [];
  const packageJson = existsSync(packagePath) ? JSON.parse(readFileSync(packagePath, "utf8")) : {};
  return checkE2e(root, flows, packageJson);
}

const invokedDirectly = process.argv[1] && import.meta.url.split("/").pop() === process.argv[1].replace(/\\/g, "/").split("/").pop();
if (invokedDirectly) {
  const root = process.argv[2];
  if (!root) {
    console.error("usage: skies-flutter-e2e-doctor <flutter-project>");
    process.exitCode = 2;
  } else {
    const result = checkE2eProject(resolve(root));
    for (const gap of result.gaps) console.error(`SKYFL-E2E ${gap}`);
    process.exitCode = result.ok ? 0 : 1;
  }
}
