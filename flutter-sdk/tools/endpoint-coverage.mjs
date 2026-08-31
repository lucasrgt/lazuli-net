#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { projectAppClient } from "./generate-client.mjs";

const METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

/** Derive every app-facing operationId from an OpenAPI contract. */
export function operationIds(document) {
  const projected = projectAppClient(document);
  const ids = [];
  for (const path of Object.values(projected.paths)) {
    for (const [method, operation] of Object.entries(path)) {
      if (METHODS.has(method.toLowerCase()) && typeof operation?.operationId === "string") ids.push(operation.operationId);
    }
  }
  return ids.sort();
}

/** Check back-to-front coverage and reject operation calls outside legal data doors. */
export function checkEndpointCoverage(ids, sources) {
  const consumers = new Map(ids.map((id) => [id, []]));
  const offDoor = [];
  for (const source of sources) {
    for (const id of ids) {
      if (!new RegExp(`\\.${escape(lowerCamel(id))}\\s*\\(`).test(source.text)) continue;
      if (isDataDoor(source.path)) consumers.get(id).push(source.path);
      else offDoor.push({ operationId: id, path: source.path });
    }
  }
  const uncovered = ids.filter((id) => consumers.get(id).length === 0);
  return { uncovered, offDoor, consumers, ok: uncovered.length === 0 && offDoor.length === 0 };
}

/** Whether a Dart file is a sanctioned generated-operation consumer. */
export function isDataDoor(path) {
  const value = path.replace(/\\/g, "/");
  return value.endsWith("_view_model.dart") || /(?:^|\/)lib\/(?:session|skies_client|guards?)\.dart$/.test(value);
}

function dartSources(root) {
  const result = [];
  const visit = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !["build", ".dart_tool", "client.gen"].includes(entry.name)) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".dart")) result.push({ path: relative(root, path), text: readFileSync(path, "utf8") });
    }
  };
  visit(root);
  return result;
}
function lowerCamel(value) { return value ? value[0].toLowerCase() + value.slice(1) : value; }
function escape(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

const invokedDirectly = process.argv[1] && import.meta.url.split("/").pop() === process.argv[1].replace(/\\/g, "/").split("/").pop();
if (invokedDirectly) {
  const [contractFile, sourceRoot, flag] = process.argv.slice(2);
  if (!contractFile || !sourceRoot) {
    console.error("usage: skies-flutter-endpoint-coverage <openapi.json> <flutter-source-root> [--strict]");
    process.exitCode = 2;
  } else {
    const ids = operationIds(JSON.parse(readFileSync(contractFile, "utf8")));
    const result = checkEndpointCoverage(ids, dartSources(sourceRoot));
    for (const item of result.offDoor) console.error(`SKYFL002 ${item.path}: ${item.operationId} consumed outside a data door`);
    for (const id of result.uncovered) console.error(`SKYFL008 ${id}: app endpoint has no ViewModel consumer`);
    const strict = flag === "--strict";
    process.exitCode = result.offDoor.length > 0 || (strict && result.uncovered.length > 0) ? 1 : 0;
  }
}
