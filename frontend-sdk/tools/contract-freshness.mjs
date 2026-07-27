#!/usr/bin/env node
// SKYFE — contract freshness (cross-stack). The typed client (client.gen) is a MIRROR of the backend's OpenAPI
// document; nothing re-checks the mirror after generation, so a backend shape change leaves the front compiling
// happily against a stale client — the drift every other loop (endpoint coverage, error-code coverage, journey
// parity) silently inherits, because they all read the client as truth. This loop pins the client to the exact
// spec it was generated from: codegen stamps the spec's hash next to the client (`--stamp`), and the doctor
// compares the stamp against the live spec. A mismatch = "the contract moved; regenerate" — a build error, not a
// runtime 404. NOTICE until the first stamp exists (so it never blocks before the codegen has run); a hard gate
// after.
//
// Usage:
//   node tools/contract-freshness.mjs <openapi.json> <client.gen dir>            # check (the doctor leg)
//   node tools/contract-freshness.mjs <openapi.json> <client.gen dir> --stamp    # stamp (the codegen tail)

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The stamp file codegen leaves next to the generated client. */
export const STAMP_FILE = ".spec-hash";

/** A stable fingerprint of the spec text (whitespace-insensitive, so a reformat is not a drift). */
export function stampOf(specText) {
  return createHash("sha256").update(JSON.stringify(JSON.parse(specText))).digest("hex");
}

/**
 * Compare the live spec against the stamp the client was generated from. Pure (no I/O).
 * @param {{ specText: string, stamp: string|null }} input
 * @returns {{ status: "ok"|"stale"|"unstamped", expected: string, messages: string[] }}
 */
export function checkFreshness({ specText, stamp }) {
  const expected = stampOf(specText);
  if (stamp === null)
    return {
      status: "unstamped",
      expected,
      messages: [
        "contract-freshness: no spec stamp next to the client yet — regenerate the client (the codegen tail writes it); NOTICE until then.",
      ],
    };
  if (stamp.trim() !== expected)
    return {
      status: "stale",
      expected,
      messages: [
        "contract-freshness: the backend contract changed since the client was generated — the front is compiling against a stale mirror. Regenerate the client (orval) and re-stamp.",
      ],
    };
  return { status: "ok", expected, messages: ["contract-freshness: client matches the live contract."] };
}

// ── CLI tail (the only I/O) ─────────────────────────────────────────────────────────────────────────────────────
const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (invokedDirectly) {
  const [, , specFile, clientDir, flag] = process.argv;
  if (!specFile || !clientDir) {
    console.error("usage: node tools/contract-freshness.mjs <openapi.json> <client.gen dir> [--stamp]");
    process.exit(2);
  }
  const specText = readFileSync(specFile, "utf8");
  const stampPath = join(clientDir, STAMP_FILE);
  if (flag === "--stamp") {
    writeFileSync(stampPath, stampOf(specText) + "\n");
    console.log(`contract-freshness: stamped ${stampPath}`);
    process.exit(0);
  }
  const stamp = existsSync(stampPath) ? readFileSync(stampPath, "utf8") : null;
  const result = checkFreshness({ specText, stamp });
  for (const m of result.messages) console.log(m);
  process.exit(result.status === "stale" ? 1 : 0);
}
