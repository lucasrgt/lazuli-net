#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

/** Extract one marker set from Dart documentation comments. */
export function extractMarkers(source, marker) {
  return [...source.matchAll(new RegExp(`@${marker}\\s+([a-z0-9][a-z0-9._-]*)`, "gi"))].map((match) => match[1]);
}

/** Prove every Flutter feature's semantic, flow, and backend-operation ledger. */
export function checkFeatureE2e(viewModels, flows, operationIds = []) {
  const gaps = [];
  const models = new Map(viewModels.map((model) => [model.feature, model]));
  for (const model of viewModels) {
    const obligations = extractMarkers(model.source, "e2e");
    const criteria = extractMarkers(model.source, "verify");
    const subjectFlows = flows.filter((flow) => flow.features?.includes(model.feature));
    const flowIds = new Set(subjectFlows.map((flow) => flow.id));
    for (const id of obligations) if (!flowIds.has(id)) gaps.push(`${model.feature}: @e2e ${id} has no subject flow`);
    for (const flow of subjectFlows) if (!obligations.includes(flow.id)) gaps.push(`${model.feature}: flow ${flow.id} lacks reciprocal @e2e`);
    for (const path of ["happy", "sad"]) {
      if (!subjectFlows.some((flow) => flow.path === path)) gaps.push(`${model.feature}: ${path} flow is missing`);
    }
    const claimed = new Set();
    const evidence = new Set();
    for (const flow of subjectFlows) {
      for (const criterion of flow.criteria ?? []) {
        if (!criteria.includes(criterion.id)) gaps.push(`${model.feature}: flow ${flow.id} claims unknown criterion ${criterion.id}`);
        if (claimed.has(criterion.id)) gaps.push(`${model.feature}: criterion ${criterion.id} is lent to multiple flows`);
        if (evidence.has(criterion.evidence)) gaps.push(`${model.feature}: evidence ${criterion.evidence} is reused`);
        claimed.add(criterion.id);
        evidence.add(criterion.evidence);
      }
    }
    for (const criterion of criteria) if (!claimed.has(criterion)) gaps.push(`${model.feature}: @verify ${criterion} has no E2E criterion evidence`);

    const consumed = operationIds.filter((id) => new RegExp(`\\.${escape(lowerCamel(id))}\\s*\\(`).test(model.source));
    for (const id of consumed) {
      if (!subjectFlows.some((flow) => flow.backendSlices?.includes(id))) gaps.push(`${model.feature}: consumed ${id} has no subject flow backendSlices proof`);
    }
  }
  for (const flow of flows) {
    for (const feature of flow.features ?? []) if (!models.has(feature)) gaps.push(`flow ${flow.id}: unknown feature ${feature}`);
  }
  return { gaps, ok: gaps.length === 0 };
}

/** Discover the production ViewModel inventory under lib/features. */
export function findViewModels(root) {
  const result = [];
  const visit = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith("_view_model.dart")) {
        result.push({
          path: relative(root, path).replace(/\\/g, "/"),
          feature: pascal(basename(path, "_view_model.dart")),
          source: readFileSync(path, "utf8"),
        });
      }
    }
  };
  visit(join(root, "lib", "features"));
  return result;
}

function lowerCamel(value) { return value ? value[0].toLowerCase() + value.slice(1) : value; }
function escape(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function pascal(value) { return value.split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(""); }

const invokedDirectly = process.argv[1] && import.meta.url.split("/").pop() === process.argv[1].replace(/\\/g, "/").split("/").pop();
if (invokedDirectly) {
  const [root, contractFile] = process.argv.slice(2);
  if (!root) {
    console.error("usage: skies-flutter-feature-e2e <flutter-project> [openapi.json]");
    process.exitCode = 2;
  } else {
    const flowsPath = join(root, "e2e", "flows.json");
    const flows = existsSync(flowsPath) ? JSON.parse(readFileSync(flowsPath, "utf8")) : [];
    const ids = contractFile ? operationIdsFrom(JSON.parse(readFileSync(contractFile, "utf8"))) : [];
    const result = checkFeatureE2e(findViewModels(root), flows, ids);
    for (const gap of result.gaps) console.error(`SKYFL035 ${gap}`);
    process.exitCode = result.ok ? 0 : 1;
  }
}

function operationIdsFrom(document) {
  return Object.values(document.paths ?? {}).flatMap((item) => Object.values(item).map((operation) => operation?.operationId).filter((id) => typeof id === "string"));
}
