#!/usr/bin/env node
// Frontend package sync — the npm half of the package-first law. The frontend framework is published:
// pilots consume eslint-plugin-skies and skies-react as packages, never as in-repo mirrors.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FRONTEND_PACKAGE_VERSIONS } from "./package-versions.mjs";

const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "bin", "obj"]);

/** @param {string} spec */
export function declaredVersion(spec) {
  return spec.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] ?? spec;
}

/**
 * @param {{
 *   canonical: ReadonlyArray<{name: string, version: string}>,
 *   declarations: ReadonlyArray<{path: string, packages: Record<string, string>}>,
 *   hasFrontend: boolean,
 *   vendoredMirror: boolean,
 * }} input
 */
export function checkPackages({ canonical, declarations, hasFrontend, vendoredMirror }) {
  const messages = [];
  if (vendoredMirror)
    messages.push(
      "framework-sync: clients/eslint-plugin-skies is a retired vendored plugin copy — delete it and "
      + "consume eslint-plugin-skies from npm.",
    );
  if (!hasFrontend) return { status: messages.length ? "drifted" : "ok", messages };

  for (const pkg of canonical) {
    const found = declarations.flatMap((entry) =>
      entry.packages[pkg.name] ? [{ path: entry.path, spec: entry.packages[pkg.name] }] : [],
    );
    if (found.length === 0) {
      messages.push(
        `framework-sync: frontend exists but no package.json declares ${pkg.name} ${pkg.version} — `
        + "consume the published framework package instead of carrying its source locally.",
      );
      continue;
    }
    const stale = found.filter((entry) => declaredVersion(entry.spec) !== pkg.version);
    if (stale.length)
      messages.push(
        `framework-sync: ${pkg.name} canonical is ${pkg.version} but this app declares `
        + stale.map((entry) => `${entry.spec} in ${entry.path}`).join(", ")
        + " — install the canonical package version and refresh the lockfile.",
      );
  }
  return { status: messages.length ? "drifted" : "ok", messages };
}

function packageDeclarations(root) {
  const declarations = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
        continue;
      }
      if (entry.name !== "package.json") continue;
      const path = join(dir, entry.name);
      const json = JSON.parse(readFileSync(path, "utf8"));
      const packages = {};
      for (const section of DEPENDENCY_SECTIONS)
        Object.assign(packages, json[section] ?? {});
      declarations.push({ path: relative(root, path), packages });
    }
  };
  walk(root);
  return declarations;
}

function frontendExists(root) {
  const clients = join(root, "clients");
  if (!existsSync(clients)) return false;
  return readdirSync(clients, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .some((entry) => {
      const dir = join(clients, entry.name);
      return existsSync(join(dir, "package.json"))
        && ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs"].some((file) => existsSync(join(dir, file)));
    });
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const [, , appRoot] = process.argv;
  if (!appRoot) {
    console.error("usage: skyfe-framework-sync <app-root>");
    process.exit(2);
  }
  const result = checkPackages({
    canonical: FRONTEND_PACKAGE_VERSIONS,
    declarations: packageDeclarations(appRoot),
    hasFrontend: frontendExists(appRoot),
    vendoredMirror: existsSync(join(appRoot, "clients", "eslint-plugin-skies")),
  });
  for (const message of result.messages) console.error(message);
  if (result.status === "ok") console.log("framework-sync: frontend package versions match the published SDK contract.");
  process.exit(result.status === "drifted" ? 1 : 0);
}
