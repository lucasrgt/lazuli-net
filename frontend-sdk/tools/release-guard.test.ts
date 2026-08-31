import { describe, expect, it } from "vitest";
import { FLUTTER_RELEASE_VERSIONS, canonicalDrift, RELEASE_UNITS, violations } from "./release-guard.mjs";
import { FLUTTER_PACKAGE_VERSIONS } from "../../flutter-sdk/tools/package-versions.mjs";

describe("release-guard", () => {
  it("keeps the self-contained release table equal to the Flutter sync table", () => {
    expect(FLUTTER_RELEASE_VERSIONS).toEqual(
      FLUTTER_PACKAGE_VERSIONS.map(({ name, version }) => ({ name, version })),
    );
  });
  it("flags a unit that changed without a version bump", () => {
    const result = violations([{ name: "@skiesjs/eslint-plugin", changed: true, versionBumped: false }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("@skiesjs/eslint-plugin");
  });

  it("passes a unit that changed and was bumped", () => {
    expect(violations([{ name: "x", changed: true, versionBumped: true }])).toEqual([]);
  });

  it("passes a unit that did not change", () => {
    expect(violations([{ name: "x", changed: false, versionBumped: false }])).toEqual([]);
  });

  it("covers every publishable package across .NET, frontend, Flutter, and Node.js", () => {
    expect(RELEASE_UNITS.map((u) => u.name)).toEqual([
      "Skies.Framework.* (nuget)",
      "skies-framework-cli",
      "@skiesjs/react",
      "@skiesjs/eslint-plugin",
      "@skiesjs/frontend-sdk",
      "skies-flutter",
      "skies_flutter",
      "@skiesjs/core",
      "@skiesjs/openapi",
      "@skiesjs/express",
      "@skiesjs/auth",
      "@skiesjs/auth-express",
      "@skiesjs/socketio",
      "@skiesjs/identity",
      "@skiesjs/mail",
      "@skiesjs/sms",
      "@skiesjs/storage",
      "@skiesjs/storage-express",
      "@skiesjs/rate-limit-express",
      "@skiesjs/drizzle-postgres",
      "@skiesjs/testing",
      "@skiesjs/testing-postgres",
      "@skiesjs/doctor",
      "@skiesjs/eslint-plugin-node",
      "@skiesjs/foundation",
      "@skiesjs/framework",
      "@skiesjs/cli",
    ]);
  });

  it("compares the canonical Flutter runtime with its pubspec", () => {
    expect(canonicalDrift(
      [{ name: "skies_flutter", version: "4.1.22" }],
      (path) => {
        expect(path).toBe("flutter-sdk/packages/skies_flutter/pubspec.yaml");
        return "name: skies_flutter\nversion: 4.1.22\n";
      },
    )).toEqual([]);
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
