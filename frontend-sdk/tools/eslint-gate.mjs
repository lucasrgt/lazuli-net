#!/usr/bin/env node

import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** Rules that define release evidence rather than project-scoped architecture or design policy. */
export const MANDATORY_RELEASE_RULES = Object.freeze([
  "data-door",
  "feature-has-e2e-flow",
  "no-disabled-tests",
  "no-mock",
  "test-colocated",
  "verify-has-avp-proof",
  "view-integration-test",
]);

/** Build a closed ESLint invocation that cannot lose the plugin or an SKYFE rule through consumer configuration. */
export function eslintGateArguments(sourcePaths, ruleNames) {
  const arguments_ = [
    ...sourcePaths,
    "--quiet",
    "--no-inline-config",
    "--plugin",
    "skies",
  ];
  for (const rule of [...ruleNames].sort()) {
    arguments_.push("--rule", `skies/${rule}:error`);
  }
  return arguments_;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sourcePaths = process.argv.slice(2);
  if (sourcePaths.length === 0) {
    console.error("usage: skyfe-eslint-gate <source-path> [more-source-paths...]");
    process.exit(2);
  }

  let plugin;
  try {
    plugin = require("eslint-plugin-skies");
  } catch {
    console.error(
      "SKYFE release gate: eslint-plugin-skies is unavailable; install the framework-pinned frontend packages.",
    );
    process.exit(1);
  }
  const missing = MANDATORY_RELEASE_RULES.filter((rule) => !plugin.rules?.[rule]);
  if (missing.length > 0) {
    console.error(`SKYFE release gate: installed plugin is missing mandatory rule(s): ${missing.join(", ")}.`);
    process.exit(1);
  }

  let eslint;
  try {
    eslint = join(dirname(require.resolve("eslint/package.json")), "bin", "eslint.js");
  } catch {
    console.error("SKYFE release gate: ESLint is unavailable; install the framework-pinned frontend packages.");
    process.exit(1);
  }
  const result = spawnSync(
    process.execPath,
    [eslint, ...eslintGateArguments(sourcePaths, MANDATORY_RELEASE_RULES)],
    { cwd: process.cwd(), stdio: "inherit" },
  );
  if (result.error) {
    console.error(`SKYFE release gate: could not start ESLint (${result.error.message}).`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
