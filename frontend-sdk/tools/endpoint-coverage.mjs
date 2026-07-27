#!/usr/bin/env node
// SKYFE008 — back->front endpoint coverage. Every app-facing generated operation should be consumed through its
// generated hook (`use<Slice>`) or imperative function (`slice`) by at least one ViewModel; one with no consumer is
// a "loose endpoint" — the backend slice exists but no screen wired it.
// This is advisory during feature construction and blocking at `skies gate`: the front->back direction (a UI calling
// an endpoint that does not exist) is already free from `tsc`, while this back->front direction reveals "backend
// done, UI not wired." Non-app endpoints never reach the client (orval's audience filter drops them), so the metric
// is high-signal by construction. See docs/FRONTEND-CONVENTIONS.md (SKYFE008).
//
// The core is pure (no I/O) so it is unit-testable; the CLI tail wires it to the filesystem. The scan also backs
// SKYFE002 directly: a consumer can accidentally scope the ESLint rule to `features/` and otherwise let a helper
// import an operation outside the ViewModel. Because this command receives every product source root, that config
// mistake cannot turn an off-door endpoint into an invisible green.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** App-facing generated hook names (`use<Name>`) declared in the generated client source. */
export function extractHooks(clientText) {
  return [...clientText.matchAll(/export\s+(?:function|const)\s+(use[A-Z]\w*)/g)].map((m) => m[1]);
}

/** Value symbols actually imported from a generated client module by the legal data doors. */
export function extractGeneratedImports(wiredText) {
  const imports = new Set();
  const declarations = wiredText.matchAll(
    /\bimport\s+(?!type\b)\{([^}]*)\}\s+from\s+["'][^"']*client\.gen(?:\/[^"']*)?["']/g,
  );
  for (const declaration of declarations) {
    for (const raw of declaration[1].split(",")) {
      const specifier = raw.trim();
      if (!specifier || specifier.startsWith("type ")) continue;
      imports.add(specifier.split(/\s+as\s+/)[0].trim());
    }
  }
  return imports;
}

/** Slice identities carried by validated raw-call declarations such as `@backendSlice Refresh POST /refresh`. */
export function extractBackendSliceLinks(sourceText) {
  return new Set(
    [...sourceText.matchAll(/@backendSlice\s+([A-Za-z_]\w*)\s+(?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)\s+\/\S+/g)]
      .map((match) => match[1]),
  );
}

/** Value symbols re-exported from a generated client module (the laundering form of an off-door import). */
export function extractGeneratedExports(sourceText) {
  const exports = new Set();
  const declarations = sourceText.matchAll(
    /\bexport\s+(?!type\b)\{([^}]*)\}\s+from\s+["'][^"']*client\.gen(?:\/[^"']*)?["']/g,
  );
  for (const declaration of declarations) {
    for (const raw of declaration[1].split(",")) {
      const specifier = raw.trim();
      if (!specifier || specifier.startsWith("type ")) continue;
      exports.add(specifier.split(/\s+as\s+/)[0].trim());
    }
  }
  return exports;
}

/**
 * Whether a file is a legal data door whose hook references count as "wired": a screen's `*.viewModel.ts`, or
 * the auth/routing infra seams (`lib/session*`, `lib/guards*`) that SKYFE002 already blesses as client consumers.
 * Without the doors, the session hooks (`useMe`/`useRefresh`/`useLogout`) report loose from day one — wallpaper
 * that buries the real gaps the metric exists to reveal.
 */
export function isDataDoor(filePath) {
  const p = filePath.replace(/\\/g, "/");
  return p.endsWith(".viewModel.ts") || /(^|\/)lib\/(session|guards)($|[./])/.test(p);
}

/**
 * Generated operations consumed outside a legal data door. Contract values such as generated enums remain free:
 * this compares imports with the generated client's operation inventory, so only actual server access is gated.
 * @param {string[]} hooks
 * @param {{ filePath: string, source: string }[]} sources
 * @returns {{ filePath: string, operations: string[] }[]}
 */
export function findOffDoorOperations(hooks, sources) {
  const operations = new Set();
  for (const hook of hooks) {
    operations.add(hook);
    const operation = hook.slice(3);
    operations.add(operation.charAt(0).toLowerCase() + operation.slice(1));
  }

  return sources
    .filter(({ filePath }) => !isDataDoor(filePath) && !/(^|[\\/])client\.gen([\\/]|$)/.test(filePath))
    .map(({ filePath, source }) => {
      const accesses = new Set([...extractGeneratedImports(source), ...extractGeneratedExports(source)]);
      return { filePath, operations: [...accesses].filter((name) => operations.has(name)).sort() };
    })
    .filter(({ operations: names }) => names.length > 0)
    .sort((a, b) => a.filePath.localeCompare(b.filePath));
}

/**
 * Back->front coverage of the generated hooks against the ViewModel layer (the only legal data door).
 * @param {string[]} hooks - hook names (from extractHooks)
 * @param {string} wiredText - concatenated source of every *.viewModel.ts
 * @returns {{ total: number, wired: number, loose: string[], messages: string[] }}
 */
export function checkEndpointCoverage(hooks, wiredText) {
  const unique = [...new Set(hooks)];
  const imports = extractGeneratedImports(wiredText);
  const rawLinks = extractBackendSliceLinks(wiredText);
  const loose = unique.filter((hook) => {
    const operation = hook.slice(3);
    const imperative = operation.charAt(0).toLowerCase() + operation.slice(1);
    return !imports.has(hook) && !imports.has(imperative) && !rawLinks.has(operation);
  }).sort();
  const messages = loose.length
    ? [`${loose.length} loose endpoint(s) — a backend slice with no screen wired yet (warning):`, ...loose.map((h) => `  - ${h}`)]
    : [];
  return { total: unique.length, wired: unique.length - loose.length, loose, messages };
}

/** Final exit policy: off-door access always blocks; loose app endpoints block only in strict release gates. */
export function endpointCoverageExitCode(result, offDoor, strict) {
  return offDoor.length > 0 || (strict && result.loose.length > 0) ? 1 : 0;
}

/** Recursively collect files under `dir` matching `pred` (missing dir -> []). */
function walk(dir, pred) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, pred));
    else if (pred(p)) out.push(p);
  }
  return out;
}

// CLI: node tools/endpoint-coverage.mjs [--strict] <client.gen file-or-directory> <srcDir> [moreSrcDirs...]
// Pass every source ROOT served by the generated client (not only features/): the scan unions every surface's data
// doors — the ViewModels plus the lib/session|guards infra seams — so multi-app products and legally-consumed
// session hooks do not pollute the loose list.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const strict = process.argv.includes("--strict") || process.env.SKY_GATE === "1";
  const [clientPath, ...srcDirs] = process.argv.slice(2).filter((argument) => argument !== "--strict");
  if (!clientPath || srcDirs.length === 0) {
    console.error("usage: node tools/endpoint-coverage.mjs [--strict] <client.gen file-or-directory> <srcDir> [moreSrcDirs...]");
    process.exit(2);
  }
  if (!existsSync(clientPath)) {
    console.log(`SKYFE008 endpoint coverage: no generated client at ${clientPath} (bootstrap) — nothing to check yet.`);
    process.exit(0);
  }
  const clientFiles = statSync(clientPath).isDirectory()
    ? walk(clientPath, (path) => /\.[cm]?[jt]sx?$/.test(path))
    : [clientPath];
  const hooks = clientFiles.flatMap((path) => extractHooks(readFileSync(path, "utf8")));
  const sourcePaths = srcDirs.flatMap((srcDir) =>
    walk(srcDir, (p) => /\.[cm]?[jt]sx?$/.test(p) && !/(^|[\\/])client\.gen([\\/]|$)/.test(p)),
  );
  const sources = sourcePaths.map((filePath) => ({ filePath, source: readFileSync(filePath, "utf8") }));
  const wiredText = sources
    .filter(({ filePath, source }) => isDataDoor(filePath) || extractBackendSliceLinks(source).size > 0)
    .map(({ source }) => source)
    .join("\n");
  const r = checkEndpointCoverage(hooks, wiredText);
  console.log(`SKYFE008 endpoint coverage: ${r.wired}/${r.total} app-facing operations wired by a ViewModel.`);
  for (const m of r.messages) console.log(`  ${m}`);
  const offDoor = findOffDoorOperations(hooks, sources);
  if (offDoor.length > 0) {
    console.error(`SKYFE002 data door: ${offDoor.length} file(s) consume generated operations outside a legal data door:`);
    for (const { filePath, operations } of offDoor) console.error(`  - ${filePath}: ${operations.join(", ")}`);
  }
  if (strict && r.loose.length > 0)
    console.error(`SKYFE008 release gate: ${r.loose.length} app-facing endpoint(s) remain unwired.`);
  process.exit(endpointCoverageExitCode(r, offDoor, strict));
}
