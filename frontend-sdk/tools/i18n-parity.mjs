#!/usr/bin/env node
// SKYFE011 (cross-package) — locale parity for *.i18n.ts catalogs, as a TOOL. The eslint rule
// (`skies/i18n-completeness`) is the in-scope mechanism: when the catalogs sit inside the linted source, it pins
// parity per file at lint time. But in a core-split layout the catalogs live in a SEPARATE package, outside the
// app's eslint scope, so the rule can never see them — this tool does, by reading the files directly. Same
// invariant (every locale object in a catalog declares the same keys; a key in one but not its siblings is a
// silent untranslated string), enforced where the rule can't reach. Use the rule OR this tool, by layout.
// Usage: node tools/i18n-parity.mjs <catalogsDir> [...moreDirs]
//   node tools/i18n-parity.mjs ../examples/sample-app/frontend/core/src

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportedObjectLiterals, topLevelObjectKeys } from "./object-literals.mjs";

/** Recursively collect every *.i18n.ts under dir (matches assemble-i18n's discovery). */
export function findCatalogs(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findCatalogs(p));
    else if (entry.name.endsWith(".i18n.ts")) out.push(p);
  }
  return out;
}

// Each exported locale object: `export const <name> = { ... } [as const];`. Catalogs are flat (no nesting), so a
// non-greedy match to the first line-starting `}` is the catalog close. Locale-agnostic by design — like the eslint
// rule, it compares whatever objects the file exports, not a fixed pt/es/en set.
export function catalogsIn(src) {
  return exportedObjectLiterals(src).map((object) => ({
    name: object.name,
    keys: topLevelObjectKeys(object.source),
  }));
}

/**
 * @param {Array<{path: string, source: string}>} files
 * @param {string[]} requiredLocales
 */
export function checkI18nParity(files, requiredLocales = []) {
  const messages = [];
  let checked = 0;
  for (const file of files) {
    const cats = catalogsIn(file.source);
    if (cats.length === 0) continue;
    const names = new Set(cats.map((catalog) => catalog.name));
    const missingLocales = requiredLocales.filter((locale) => !names.has(locale));
    if (missingLocales.length)
      messages.push(`SKYFE011 ${file.path}: missing locale export(s): ${missingLocales.join(", ")}`);
    if (cats.length < 2) continue;
    checked++;
    const union = new Set();
    for (const catalog of cats) for (const key of catalog.keys) union.add(key);
    for (const catalog of cats) {
      const missing = [...union].filter((key) => !catalog.keys.has(key));
      if (missing.length)
        messages.push(
          `SKYFE011 ${file.path}: locale \`${catalog.name}\` missing ${missing.length} key(s): ${missing.sort().join(", ")}`,
        );
    }
  }
  return { checked, messages, ok: messages.length === 0 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const localesFlag = args.indexOf("--require-locales");
  const requiredLocales =
    localesFlag >= 0 ? String(args.splice(localesFlag, 2)[1] ?? "").split(",").filter(Boolean) : [];
  if (args.length === 0) {
    console.error("usage: skyfe-i18n-parity <catalogsDir> [...moreDirs] [--require-locales ptBR,esES,enUS]");
    process.exit(2);
  }
  const paths = args.flatMap(findCatalogs);
  if (paths.length === 0) {
    console.error(`no *.i18n.ts catalogs found under ${args.join(", ")}`);
    process.exit(1);
  }
  const result = checkI18nParity(
    paths.map((path) => ({ path: path.replace(/\\/g, "/"), source: readFileSync(path, "utf8") })),
    requiredLocales,
  );
  for (const message of result.messages) console.error(message);
  console.log(`SKYFE011 i18n-parity: ${result.checked} multi-locale catalog(s) checked.`);
  process.exit(result.ok ? 0 : 1);
}
