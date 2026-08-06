import { describe, expect, it } from "vitest";
import { canonicalDrift, RELEASE_UNITS, violations } from "./release-guard.mjs";

describe("release-guard", () => {
  it("flags a unit that changed without a version bump", () => {
    const result = violations([{ name: "eslint-plugin-skies", changed: true, versionBumped: false }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("eslint-plugin-skies");
  });

  it("passes a unit that changed and was bumped", () => {
    expect(violations([{ name: "x", changed: true, versionBumped: true }])).toEqual([]);
  });

  it("passes a unit that did not change", () => {
    expect(violations([{ name: "x", changed: false, versionBumped: false }])).toEqual([]);
  });

  it("covers every publishable package across .NET, frontend, and Node.js", () => {
    expect(RELEASE_UNITS.map((u) => u.name)).toEqual([
      "Skies.Framework.* (nuget)",
      "skies-framework-cli",
      "skies-react",
      "eslint-plugin-skies",
      "skies-frontend-sdk",
      "@skiesjs/core",
      "@skiesjs/express",
      "eslint-plugin-skies-node",
      "@skiesjs/cli",
    ]);
  });

  it("treats every npm manifest as immutable published content", () => {
    const npmUnits = RELEASE_UNITS.filter((unit) => unit.version.endsWith("package.json"));
    expect(npmUnits).not.toHaveLength(0);
    expect(npmUnits.every((unit) => unit.paths.includes(unit.version))).toBe(true);
  });

  it("compares the externally released Assay protocol with its installed manifest", () => {
    expect(canonicalDrift(
      [{ name: "avp-assay", version: "0.4.0" }],
      (path) => {
        expect(path).toBe("frontend-sdk/node_modules/avp-assay/package.json");
        return JSON.stringify({ version: "0.4.0" });
      },
    )).toEqual([]);
  });

  it("compares Assay Design with its installed package manifest", () => {
    expect(canonicalDrift(
      [{ name: "assay-design", version: "0.4.7" }],
      (path) => {
        expect(path).toBe("frontend-sdk/node_modules/assay-design/package.json");
        return JSON.stringify({ version: "0.4.7" });
      },
    )).toEqual([]);
  });

  it("rejects drift in the externally released Assay protocol", () => {
    const result = canonicalDrift(
      [{ name: "avp-assay", version: "0.4.0" }],
      () => JSON.stringify({ version: "0.4.1" }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("avp-assay");
  });
});
