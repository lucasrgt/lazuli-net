#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderFeature, snake } from "./generate.mjs";

function parseArguments(args) {
  const name = args[0];
  const values = { name };
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) return null;
    values[key.slice(2)] = value;
  }
  return values.name && values["item-type"] && values["item-import"] && values["app-package"] && values.project && values.verify
    ? values
    : null;
}

const invokedDirectly =
  process.argv[1] && import.meta.url.split("/").pop() === process.argv[1].replace(/\\/g, "/").split("/").pop();
if (invokedDirectly) {
  const options = parseArguments(process.argv.slice(2));
  if (!options) {
    console.error("usage: skies-flutter-feature <name> --item-type <Type> --item-import <uri> --app-package <name> --project <directory> --verify <criterion,criterion,...> [--zone <audience>]");
    process.exitCode = 2;
  } else {
    const project = resolve(options.project);
    const stem = snake(options.name);
    const segments = [options.zone ? snake(options.zone) : "", stem].filter(Boolean);
    const libOutput = join(project, "lib", "features", ...segments);
    const testOutput = join(project, "test", "features", ...segments);
    const l10nOutput = join(project, "lib", "l10n", "features");
    const files = renderFeature({
      name: options.name,
      itemType: options["item-type"],
      itemImport: options["item-import"],
      appPackage: options["app-package"],
      zone: options.zone,
      criteria: options.verify.split(",").map((value) => value.trim()).filter(Boolean),
    });
    const outputs = [
      ...Object.entries(files.lib).map(([name, contents]) => [join(libOutput, name), contents]),
      ...Object.entries(files.test).map(([name, contents]) => [join(testOutput, name), contents]),
      ...Object.entries(files.l10n).map(([name, contents]) => [join(l10nOutput, name), contents]),
    ];
    const collisions = outputs.map(([path]) => path).filter(existsSync);
    if (collisions.length > 0) {
      console.error(`refusing to overwrite ${collisions.join(", ")}`);
      process.exitCode = 1;
    } else {
      mkdirSync(libOutput, { recursive: true });
      mkdirSync(testOutput, { recursive: true });
      mkdirSync(l10nOutput, { recursive: true });
      for (const [path, contents] of outputs) {
        writeFileSync(path, contents);
        console.log(`created ${path}`);
      }
    }
  }
}
