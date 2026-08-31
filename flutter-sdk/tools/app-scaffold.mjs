#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { FLUTTER_PACKAGE_VERSIONS } from "./package-versions.mjs";

/** Render the removable npm harness that lets the repository-level Skies gate own a Flutter app. */
export function renderFlutterHarness() {
  const tooling = FLUTTER_PACKAGE_VERSIONS.find((item) => item.ecosystem === "npm");
  return {
    "package.json": `${JSON.stringify({
      private: true,
      scripts: {
        lint: "skies-flutter-doctor .",
        typecheck: "flutter analyze",
        test: "flutter test --exclude-tags=avp",
        "test:avp": "flutter test --tags=avp",
        "test:e2e": "flutter test integration_test",
        check: "npm run typecheck && npm run lint && npm run test && npm run test:avp",
      },
      devDependencies: { [tooling.name]: tooling.version },
    }, null, 2)}\n`,
    "l10n.yaml": "arb-dir: lib/l10n\ntemplate-arb-file: app_en.arb\noutput-localization-file: app_localizations.dart\n",
    "e2e/flows.json": "[]\n",
  };
}

/** Confirm the target is an ordinary Flutter application before writing its harness files. */
export function validateFlutterProject(root) {
  const pubspec = join(resolve(root), "pubspec.yaml");
  if (!existsSync(pubspec)) return "pubspec.yaml is missing";
  const source = readFileSync(pubspec, "utf8");
  if (!/^\s*flutter\s*:\s*$/m.test(source)) return "pubspec.yaml has no Flutter section";
  return null;
}

const invokedDirectly = process.argv[1] && import.meta.url.split("/").pop() === process.argv[1].replace(/\\/g, "/").split("/").pop();
if (invokedDirectly) {
  const root = process.argv[2];
  if (!root) {
    console.error("usage: skies-flutter-app <flutter-project>");
    process.exitCode = 2;
  } else {
    const project = resolve(root);
    const invalid = validateFlutterProject(project);
    if (invalid) {
      console.error(`skies-flutter-app: ${invalid}`);
      process.exitCode = 1;
    } else {
      const files = renderFlutterHarness();
      const collisions = Object.keys(files).map((path) => join(project, path)).filter(existsSync);
      if (collisions.length > 0) {
        console.error(`refusing to overwrite ${collisions.join(", ")}`);
        process.exitCode = 1;
      } else {
        for (const [path, source] of Object.entries(files)) {
          const output = join(project, path);
          mkdirSync(dirname(output), { recursive: true });
          writeFileSync(output, source);
          console.log(`created ${output}`);
        }
      }
    }
  }
}
