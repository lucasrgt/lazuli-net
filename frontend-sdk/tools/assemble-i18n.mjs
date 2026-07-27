#!/usr/bin/env node
// Assemble the i18n resource tree from every feature's *.i18n.ts catalog — what the harness wired by hand. It
// discovers the catalogs, derives each namespace from the filename, and emits a generated module that imports the
// locale catalogs and composes `resources` (locale -> namespace). The output typechecks, so a missing/renamed
// catalog fails the build; pair it with SKYFE011 (keys parity within each catalog) — the skies/i18n-completeness
// eslint rule when catalogs are in lint scope, or tools/i18n-parity.mjs when they are cross-package.
// Usage: node tools/assemble-i18n.mjs <featuresDir> <outFile>
//   node tools/assemble-i18n.mjs sample sample/harness/resources.generated.ts

import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";
import { renderResources } from "./generate.mjs";

const [, , featuresDir, outFile] = process.argv;
if (!featuresDir || !outFile) {
  console.error("usage: node tools/assemble-i18n.mjs <featuresDir> <outFile>");
  process.exit(2);
}

/** Recursively collect every *.i18n.ts under dir. */
function findCatalogs(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findCatalogs(p));
    else if (entry.name.endsWith(".i18n.ts")) out.push(p);
  }
  return out;
}

const outDir = dirname(outFile);
const features = findCatalogs(featuresDir).map((p) => {
  const ns = basename(p).replace(/\.i18n\.ts$/, "");
  // Import path relative to the output file, POSIX-style, extensionless.
  let importPath = relative(outDir, p).replace(/\\/g, "/").replace(/\.ts$/, "");
  if (!importPath.startsWith(".")) importPath = `./${importPath}`;
  return { ns, importPath };
});

if (features.length === 0) {
  console.error(`no *.i18n.ts catalogs found under ${featuresDir}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, renderResources(features));
console.log(`assembled ${features.length} catalog(s) -> ${outFile}:`);
for (const f of features) console.log(`  ${f.ns}  (${f.importPath})`);
