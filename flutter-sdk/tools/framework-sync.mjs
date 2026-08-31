#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FLUTTER_PACKAGE_VERSIONS } from "./package-versions.mjs";

/** Extract a dependency version from ordinary pubspec YAML. */
export function pubspecVersion(source, packageName) {
  const match = source.match(new RegExp(`^\\s{2}${escape(packageName)}:\\s*['\"]?([^'\"\\s]+)`, "m"));
  if (!match || match[1] === "\n") return null;
  return match[1].replace(/^[\^~]/, "");
}

/** Compare npm tooling and Dart runtime declarations against one canonical pair. */
export function checkFrameworkSync({ packageJson, pubspec, canonical = FLUTTER_PACKAGE_VERSIONS }) {
  const messages = [];
  for (const item of canonical) {
    const actual = item.ecosystem === "npm"
      ? packageJson?.dependencies?.[item.name] ?? packageJson?.devDependencies?.[item.name]
      : pubspecVersion(pubspec, item.name);
    const normalized = typeof actual === "string" ? actual.replace(/^[\^~]/, "") : null;
    if (normalized !== item.version) messages.push(`${item.name}: expected ${item.version}, found ${actual ?? "missing"}`);
  }
  return { messages, ok: messages.length === 0 };
}

function escape(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

const invokedDirectly = process.argv[1] && import.meta.url.split("/").pop() === process.argv[1].replace(/\\/g, "/").split("/").pop();
if (invokedDirectly) {
  const root = resolve(process.argv[2] ?? ".");
  const packagePath = join(root, "package.json");
  const pubspecPath = join(root, "pubspec.yaml");
  if (!existsSync(packagePath) || !existsSync(pubspecPath)) {
    console.error("SKYFL framework-sync requires package.json and pubspec.yaml");
    process.exitCode = 2;
  } else {
    const result = checkFrameworkSync({
      packageJson: JSON.parse(readFileSync(packagePath, "utf8")),
      pubspec: readFileSync(pubspecPath, "utf8"),
    });
    for (const message of result.messages) console.error(`SKYFL framework-sync ${message}`);
    process.exitCode = result.ok ? 0 : 1;
  }
}
