#!/usr/bin/env node
// Scaffold the design layer (docs/DESIGN-CONVENTIONS.md) — the taxonomy and the closed-API kit ship
// as code the app owns, never as a package it versions against.
// Usage:
//   node tools/design-scaffold.mjs [tokensDir]          # the token contract (default core/src/design)
//   node tools/design-scaffold.mjs --kit web [kitDir]   # the closed-API web kit (default web/src/ui)
// The emitted tokens.ts is the taxonomy with starting values; edit the VALUES (brand, dark mode),
// never the names — the design band (SKYFE024-026 + SKYFE012) polices the names. The kit is the app's
// `@/ui` door: extend it there, repoint tokens-bridge.ts if your tokens live elsewhere.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { renderDesign } from "./generate.mjs";
import { renderUiKitWeb } from "./ui-kit-web.mjs";

const args = process.argv.slice(2);
const kitIx = args.indexOf("--kit");

let dir, files, banner, next;
if (kitIx >= 0) {
  const variant = args[kitIx + 1];
  if (variant !== "web") {
    console.error('usage: node tools/design-scaffold.mjs --kit web [kitDir] (only the "web" kit ships)');
    process.exit(2);
  }
  dir = args[kitIx + 2] ?? join("web", "src", "ui");
  files = renderUiKitWeb();
  banner = "scaffolded the web ui kit:";
  next =
    "\nnext: point your @/ui alias at ui/index.ts, wire the @/design/tokens alias (tokens-bridge.ts imports it), read docs/DESIGN-CONVENTIONS.md.";
} else {
  dir = args[0] ?? join("core", "src", "design");
  files = renderDesign();
  banner = "scaffolded the design token contract:";
  next =
    "\nnext: replace the starting values with your brand (names stay), map your styling mechanism from tokens.ts, read docs/DESIGN-CONVENTIONS.md.";
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

console.log(banner);
for (const p of written) console.log(`  ${p}`);
console.log(next);
