#!/usr/bin/env node
// Scaffold a feature unit (ViewModel + View + test + i18n) — the frontend parallel of the backend scaffold.
// Usage: node tools/scaffold-feature.mjs <plural-name> --verify <happy-id,sad-id,...> [targetDir]
//   node tools/scaffold-feature.mjs bookings --verify lists-authoritative-bookings,reveals-list-failure sample/bookings
// The emitted unit is the blessed shape with names substituted; it passes the SKYFE rules + typechecks by
// construction (the sample it is templated from does). Refine the entity fields, the copy, and the slice after.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { renderFeature, pascal } from "./generate.mjs";

const [, , name, verifyFlag, verifyValue, targetDir] = process.argv;
if (!name || verifyFlag !== "--verify" || !verifyValue) {
  console.error("usage: node tools/scaffold-feature.mjs <plural-name> --verify <happy-id,sad-id,...> [targetDir]");
  process.exit(2);
}

const criteria = verifyValue.split(",").map((value) => value.trim()).filter(Boolean);
if (criteria.length < 2) {
  console.error("every visible feature needs at least two semantic criteria: one happy outcome and one sad outcome");
  process.exit(2);
}

const dir = targetDir ?? join("sample", name.toLowerCase());
let files;
try {
  files = renderFeature(name, criteria);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

mkdirSync(dir, { recursive: true });
const written = [];
for (const [filename, contents] of Object.entries(files)) {
  const path = join(dir, filename);
  if (existsSync(path)) {
    console.error(`refusing to overwrite ${path}`);
    process.exit(1);
  }
  writeFileSync(path, contents);
  written.push(path);
}

console.log(`scaffolded ${pascal(name)} feature unit:`);
for (const p of written) console.log(`  ${p}`);
console.log(`\nnext: implement every red AVP proof, add distinct asserted evidence to the happy/sad E2E flows, then run \`npm run check\`.`);
