import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { eslintGateArguments, MANDATORY_RELEASE_RULES } from "./eslint-gate.mjs";

const require = createRequire(import.meta.url);
const plugin = require("../packages/eslint-plugin/index.cjs");

describe("eslintGateArguments", () => {
  it("loads the plugin and promotes every mandatory release-evidence rule to an error", () => {
    const arguments_ = eslintGateArguments(["src"], MANDATORY_RELEASE_RULES);
    const forced = arguments_
      .filter((argument) => argument.startsWith("skies/"))
      .map((argument) => argument.replace(/^skies\//, "").replace(/:error$/, ""));

    expect(MANDATORY_RELEASE_RULES.every((rule) => plugin.rules[rule])).toBe(true);
    expect(arguments_).toContain("--quiet");
    expect(arguments_).toContain("--no-inline-config");
    expect(arguments_).toContain("--plugin");
    expect(arguments_).toContain("skies");
    expect(forced.sort()).toEqual([...MANDATORY_RELEASE_RULES].sort());
  });
});
