#!/usr/bin/env node
// SKYFE — error-code coverage (cross-package). The backend ships every error as a stable code (the registry consts
// behind SKY0018/SKY0019), enumerated into the OpenAPI `ErrorBody.code`; the front owns the copy. This proves every
// code has a catalog entry, so no error reaches a user untranslated. Pair with i18n-parity (SKYFE011), which proves
// that entry exists in EVERY locale: coverage = code → copy, parity = copy → every language. Together they are the
// front end of the SKY0018/SKY0019 discipline.
//
// It reads the GENERATED client's ErrorBody union (orval output) directly — the cross-package analogue of an
// in-source rule — and is a NOTICE until the client is regenerated against the enum-bearing contract, a hard gate
// after (so it never blocks before the codegen has run).
// Usage: node tools/error-code-coverage.mjs <catalog.i18n.ts> <errorBody.ts>
//   node tools/error-code-coverage.mjs ../app-core/src/i18n/api-errors.i18n.ts ../app-core/src/client.gen/model/errorBody.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { exportedObjectLiterals, topLevelObjectKeys } from "./object-literals.mjs";

// Keys across all exported catalog objects (locale-agnostic; SKYFE011 guarantees the locales agree, so the union is
// the catalog's key set). Same flat-catalog parsing as i18n-parity: a key is a quoted/bare token after `{` or `,`.
export function catalogKeys(src) {
  const keys = new Set();
  for (const object of exportedObjectLiterals(src))
    for (const key of topLevelObjectKeys(object.source)) keys.add(key);
  return keys;
}

// The generated contract can encode the enum either inline (`code: 'a' | 'b'`) or as Orval's dedicated
// `export const ErrorBodyCode = { Name: 'a' } as const`. Both are the same contract and must be checked.
export function contractCodes(src) {
  const enumObject = src.match(/export const \w+\s*=\s*\{([\s\S]*?)\}\s*as const/);
  if (enumObject) {
    const values = [...enumObject[1].matchAll(/:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
    if (values.length) return new Set(values);
  }
  const field = src.match(/\bcode\??:\s*([^;]+);/);
  if (!field) return null;
  const codes = [...field[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  return codes.length ? new Set(codes) : null;
}

export function checkErrorCodeCoverage(catalog, contract) {
  if (contract === null)
    return { uncovered: [], orphan: [], status: "unavailable", ok: true };
  const uncovered = [...contract].filter((code) => !catalog.has(code)).sort();
  const orphan = [...catalog].filter((key) => !contract.has(key)).sort();
  return { uncovered, orphan, status: "checked", ok: uncovered.length === 0 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , catalogFile, errorBodyFile] = process.argv;
  if (!catalogFile || !errorBodyFile) {
    console.error("usage: skyfe-error-code-coverage <catalog.i18n.ts> <errorBody-or-enum.ts>");
    process.exit(2);
  }
  const catalog = catalogKeys(readFileSync(catalogFile, "utf8"));
  let contract;
  try {
    contract = contractCodes(readFileSync(errorBodyFile, "utf8"));
  } catch {
    contract = null;
  }
  const result = checkErrorCodeCoverage(catalog, contract);
  if (contract === null) {
    console.log(`SKYFE error-codes: ${catalog.size} code(s) in the catalog.`);
    console.log("  note: regenerate the client against the enum-bearing contract to check ErrorBody.code coverage.");
    process.exit(0);
  }
  console.log(`SKYFE error-codes: ${contract.size} code(s) in the contract, ${catalog.size} in the catalog.`);
  if (result.orphan.length)
    console.log(`  ${result.orphan.length} catalog key(s) not in the contract (stale?): ${result.orphan.join(", ")}`);
  if (result.uncovered.length) {
    console.error(`  ${result.uncovered.length} code(s) with no translation: ${result.uncovered.join(", ")}`);
    process.exit(1);
  }
  process.exit(0);
}
