#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** The generated-client contract stamp. */
export const STAMP_FILE = ".spec-hash";

/** Fingerprint an OpenAPI document without formatting sensitivity. */
export function stampOf(specText) {
  return createHash("sha256").update(JSON.stringify(JSON.parse(specText))).digest("hex");
}

/** Compare a generated mirror with the contract it claims to implement. */
export function checkFreshness({ specText, stamp }) {
  const expected = stampOf(specText);
  if (stamp == null) return { status: "unstamped", expected, ok: true, messages: ["SKYFL contract freshness: client is not stamped; regenerate it."] };
  if (stamp.trim() !== expected) return { status: "stale", expected, ok: false, messages: ["SKYFL contract freshness: backend contract moved; regenerate the dart-dio client."] };
  return { status: "ok", expected, ok: true, messages: ["SKYFL contract freshness: client matches the contract."] };
}

const invokedDirectly = process.argv[1] && import.meta.url.split("/").pop() === process.argv[1].replace(/\\/g, "/").split("/").pop();
if (invokedDirectly) {
  const [specFile, clientDir, flag] = process.argv.slice(2);
  if (!specFile || !clientDir) {
    console.error("usage: skies-flutter-contract-freshness <openapi.json> <generated-client> [--stamp]");
    process.exitCode = 2;
  } else {
    const specText = readFileSync(specFile, "utf8");
    const stampPath = join(clientDir, STAMP_FILE);
    if (flag === "--stamp") {
      writeFileSync(stampPath, `${stampOf(specText)}\n`);
      console.log(`stamped ${stampPath}`);
    } else {
      const result = checkFreshness({ specText, stamp: existsSync(stampPath) ? readFileSync(stampPath, "utf8") : null });
      for (const message of result.messages) console.log(message);
      process.exitCode = result.ok ? 0 : 1;
    }
  }
}
