#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const marker = ".skies-generated-client";
const httpMethods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
const excludedKinds = new Set(["asset", "webhook", "internal"]);
const excludedTags = new Set(["skies:asset", "skies:webhook", "skies:internal"]);

/** Return a copy containing only operations eligible for an application client. */
export function projectAppClient(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new TypeError("the OpenAPI contract must be a JSON object");
  }
  if (!document.paths || typeof document.paths !== "object" || Array.isArray(document.paths)) {
    throw new TypeError("the OpenAPI contract must contain a paths object");
  }

  const projected = structuredClone(document);
  for (const [path, pathItem] of Object.entries(projected.paths)) {
    if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!httpMethods.has(method.toLowerCase())) continue;
      if (excludedFromAppClient(operation)) delete pathItem[method];
    }
    if (!Object.keys(pathItem).some((key) => httpMethods.has(key.toLowerCase()))) {
      delete projected.paths[path];
    }
  }
  pruneComponents(projected);
  return projected;
}

function pruneComponents(document) {
  const components = document.components;
  if (!components || typeof components !== "object" || Array.isArray(components)) return;

  const reachable = new Map();
  const visited = new Set();
  const retainReference = (reference) => {
    if (typeof reference !== "string" || !reference.startsWith("#/components/")) return;
    const segments = reference
      .slice(2)
      .split("/")
      .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
    if (segments.length < 3 || segments[0] !== "components") return;
    const [, section, name] = segments;
    const key = `${section}/${name}`;
    if (visited.has(key)) return;
    const component = components[section]?.[name];
    if (component === undefined) return;

    visited.add(key);
    const names = reachable.get(section) ?? new Set();
    names.add(name);
    reachable.set(section, names);
    visit(component);
  };
  const visit = (node) => {
    if (typeof node === "string") {
      retainReference(node);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const value of node) visit(value);
      return;
    }
    if (typeof node.$ref === "string") retainReference(node.$ref);
    for (const value of Object.values(node)) visit(value);
  };

  const root = { ...document };
  delete root.components;
  visit(root);

  const projected = {};
  for (const [section, values] of Object.entries(components)) {
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    const names = section === "securitySchemes" ? new Set(Object.keys(values)) : reachable.get(section);
    if (!names || names.size === 0) continue;
    projected[section] = Object.fromEntries(
      Object.entries(values).filter(([name]) => names.has(name)),
    );
  }
  if (Object.keys(projected).length === 0) delete document.components;
  else document.components = projected;
}

function excludedFromAppClient(operation) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) return false;
  if (operation["x-skies-app-client-excluded"] === true) return true;
  const kind = operation["x-skies-endpoint-kind"];
  if (typeof kind === "string" && excludedKinds.has(kind.toLowerCase())) return true;
  return Array.isArray(operation.tags) && operation.tags.some((tag) => excludedTags.has(tag));
}

/** Build the stock OpenAPI Generator arguments pinned by this package. */
export function generatorArguments({ input, output, name, version = "0.1.0" }) {
  validatePackageName(name);
  return [
    "generate",
    "-g",
    "dart-dio",
    "-i",
    input,
    "-o",
    output,
    "--additional-properties",
    `pubName=${name},pubVersion=${version},pubPublishTo=none,serializationLibrary=built_value`,
    "--global-property",
    "apiDocs=false,modelDocs=false,apiTests=false,modelTests=false",
  ];
}

/** Generate, verify, and atomically publish one owned client directory. */
export async function generateClient(options) {
  const input = resolve(options.input);
  const output = resolve(options.output);
  validatePackageName(options.name);
  validateOutput(output);
  if (!existsSync(input)) throw new Error(`contract not found: ${input}`);

  const parent = dirname(output);
  mkdirSync(parent, { recursive: true });
  const temporary = mkdtempSync(join(parent, ".skies-flutter-client-"));
  const projectedPath = join(temporary, "app-client.openapi.json");
  const generatedPath = join(temporary, "generated");

  try {
    const contract = JSON.parse(readFileSync(input, "utf8"));
    const projected = projectAppClient(contract);
    writeFileSync(projectedPath, `${JSON.stringify(projected, null, 2)}\n`);

    const cli = require.resolve("@openapitools/openapi-generator-cli/main.js");
    await run(process.execPath, [cli, ...generatorArguments({
      input: projectedPath,
      output: generatedPath,
      name: options.name,
      version: options.version,
    })], sdkRoot);

    const dart = dartExecutable();
    await run(dart, ["pub", "get"], generatedPath);
    await run(dart, ["run", "build_runner", "build"], generatedPath);
    await run(dart, ["format", "lib"], generatedPath);
    await run(dart, ["analyze", "--no-fatal-warnings"], generatedPath);
    const specHash = createHash("sha256").update(JSON.stringify(contract)).digest("hex");
    writeFileSync(join(generatedPath, ".spec-hash"), `${specHash}\n`);
    writeFileSync(join(generatedPath, marker), "generated by skies-flutter; replace as a unit\n");

    publishGenerated(generatedPath, output);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function dartExecutable() {
  const configured = process.env.DART_BIN || "dart";
  if (process.platform !== "win32" || !/\.(bat|cmd)$/i.test(configured)) return configured;

  const flutterDart = resolve(dirname(configured), "cache", "dart-sdk", "bin", "dart.exe");
  if (existsSync(flutterDart)) return flutterDart;
  throw new Error("DART_BIN must name dart.exe on Windows, or Flutter's bin/dart.bat so its SDK executable can be resolved");
}

function publishGenerated(generatedPath, output) {
  if (!existsSync(output)) {
    renameSync(generatedPath, output);
    return;
  }
  if (!existsSync(join(output, marker))) {
    throw new Error(`refusing to replace ${output}: ${marker} is missing`);
  }

  const backup = `${output}.skies-backup-${randomUUID()}`;
  renameSync(output, backup);
  try {
    renameSync(generatedPath, output);
    rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (!existsSync(output) && existsSync(backup)) renameSync(backup, output);
    throw error;
  }
}

function validatePackageName(name) {
  if (typeof name !== "string" || !/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new TypeError("--name must be a lowercase Dart package identifier");
  }
}

function validateOutput(output) {
  const root = resolve(output);
  if (root === resolve(process.cwd()) || dirname(root) === root) {
    throw new Error("the generated output must be a dedicated child directory");
  }
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) return null;
    values[key.slice(2)] = value;
  }
  return values.input && values.output && values.name ? values : null;
}

const invokedDirectly =
  process.argv[1] && import.meta.url.split("/").pop() === process.argv[1].replace(/\\/g, "/").split("/").pop();
if (invokedDirectly) {
  const options = parseArguments(process.argv.slice(2));
  if (!options) {
    console.error("usage: skies-flutter-client --input <openapi.json> --output <directory> --name <dart_package> [--version <semver>]");
    process.exitCode = 2;
  } else {
    generateClient(options).catch((error) => {
      console.error(`skies-flutter-client: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
