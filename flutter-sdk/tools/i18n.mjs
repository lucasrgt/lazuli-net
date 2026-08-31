#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const LOCALE = /_(pt(?:_BR)?|en(?:_US)?|es(?:_ES)?)\.arb$/;

/** Recursively find Flutter ARB catalogs. */
export function findArb(root) {
  const result = [];
  if (!existsSync(root)) return result;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...findArb(path));
    else if (entry.isFile() && entry.name.endsWith(".arb")) result.push(path);
  }
  return result.sort();
}

/** Check key parity inside every locale family. */
export function checkArbParity(catalogs, requiredLocales = []) {
  const groups = groupCatalogs(catalogs);
  const messages = [];
  for (const [family, entries] of groups) {
    const locales = new Set(entries.map((entry) => entry.locale));
    const missingLocales = requiredLocales.filter((locale) => !locales.has(locale));
    if (missingLocales.length > 0) messages.push(`SKYFL011 ${family}: missing locales ${missingLocales.join(", ")}`);
    const union = new Set(entries.flatMap((entry) => [...entry.keys]));
    for (const entry of entries) {
      const missing = [...union].filter((key) => !entry.keys.has(key));
      if (missing.length > 0) messages.push(`SKYFL011 ${entry.path}: missing keys ${missing.join(", ")}`);
    }
  }
  return { checked: groups.size, messages, ok: messages.length === 0 };
}

/** Merge co-located feature ARBs into one gen_l10n catalog per locale. */
export function assembleArb(catalogs) {
  const output = new Map();
  for (const catalog of catalogs) {
    const match = basename(catalog.path).match(LOCALE);
    if (!match) continue;
    const locale = match[1];
    const merged = output.get(locale) ?? {};
    for (const [key, value] of Object.entries(catalog.value)) {
      if (key in merged) throw new Error(`duplicate ARB key ${key} in locale ${locale}`);
      merged[key] = value;
    }
    output.set(locale, merged);
  }
  return output;
}

/** Extract canonical ErrorBody codes from OpenAPI. */
export function contractErrorCodes(document) {
  const schemas = document?.components?.schemas ?? {};
  for (const [name, schema] of Object.entries(schemas)) {
    if (!/ErrorBody$/i.test(name)) continue;
    const values = schema?.properties?.code?.enum;
    if (Array.isArray(values)) return new Set(values.filter((value) => typeof value === "string"));
  }
  return null;
}

/** Check that every stable backend error code has localized copy. */
export function checkErrorCodeCoverage(catalog, codes, prefix = "apiError_") {
  if (codes == null) return { status: "unavailable", uncovered: [], ok: true };
  const uncovered = [...codes].filter((code) => !(prefix + code in catalog)).sort();
  return { status: "checked", uncovered, ok: uncovered.length === 0 };
}

function groupCatalogs(catalogs) {
  const groups = new Map();
  for (const catalog of catalogs) {
    const name = basename(catalog.path);
    const match = name.match(LOCALE);
    if (!match) continue;
    const family = name.replace(LOCALE, "");
    const entries = groups.get(family) ?? [];
    entries.push({ path: catalog.path, locale: match[1], keys: new Set(Object.keys(catalog.value).filter((key) => !key.startsWith("@"))) });
    groups.set(family, entries);
  }
  return groups;
}

function readCatalog(path) { return { path, value: JSON.parse(readFileSync(path, "utf8")) }; }

const invokedDirectly = process.argv[1] && import.meta.url.split("/").pop() === process.argv[1].replace(/\\/g, "/").split("/").pop();
if (invokedDirectly) {
  const [command, root, output] = process.argv.slice(2);
  if (!command || !root || !["check", "assemble"].includes(command)) {
    console.error("usage: skies-flutter-i18n <check|assemble> <catalog-root> [output-directory]");
    process.exitCode = 2;
  } else {
    const catalogs = findArb(root).map(readCatalog);
    if (command === "check") {
      const result = checkArbParity(catalogs);
      for (const message of result.messages) console.error(message);
      process.exitCode = result.ok ? 0 : 1;
    } else if (!output) {
      console.error("assemble requires an output directory");
      process.exitCode = 2;
    } else {
      mkdirSync(output, { recursive: true });
      for (const [locale, value] of assembleArb(catalogs)) {
        writeFileSync(join(output, `app_${locale}.arb`), `${JSON.stringify(value, null, 2)}\n`);
      }
    }
  }
}
