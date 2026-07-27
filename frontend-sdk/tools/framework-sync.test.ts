import { describe, expect, it } from "vitest";
import { checkPackages, declaredVersion } from "./framework-sync.mjs";
import { FRONTEND_PACKAGE_VERSIONS } from "./package-versions.mjs";

const canonical = FRONTEND_PACKAGE_VERSIONS;

describe("framework-sync", () => {
  it("accepts normal semver ranges at the canonical versions", () => {
    const result = checkPackages({
      canonical,
      declarations: [{
        path: "clients/app/package.json",
        packages: {
          "skies-frontend-sdk": `^${canonical.find((entry) => entry.name === "skies-frontend-sdk")?.version}`,
          "avp-assay": `^${canonical.find((entry) => entry.name === "avp-assay")?.version}`,
          "eslint-plugin-skies": `^${canonical.find((entry) => entry.name === "eslint-plugin-skies")?.version}`,
          "skies-react": `~${canonical.find((entry) => entry.name === "skies-react")?.version}`,
        },
      }],
      hasFrontend: true,
      vendoredMirror: false,
    });
    expect(result.status).toBe("ok");
  });

  it("fails stale or missing framework packages", () => {
    const result = checkPackages({
      canonical,
      declarations: [{
        path: "clients/app/package.json",
        packages: {
          "skies-frontend-sdk": "^0.1.0",
          "eslint-plugin-skies": "^0.10.0",
        },
      }],
      hasFrontend: true,
      vendoredMirror: false,
    });
    expect(result.status).toBe("drifted");
    expect(result.messages.join("\n")).toContain("0.10.0");
    expect(result.messages.join("\n")).toContain("skies-react");
    expect(result.messages.join("\n")).toContain("avp-assay");
  });

  it("rejects the retired in-repo plugin mirror", () => {
    const result = checkPackages({
      canonical,
      declarations: [],
      hasFrontend: false,
      vendoredMirror: true,
    });
    expect(result.status).toBe("drifted");
    expect(result.messages[0]).toContain("retired vendored");
  });

  it("extracts the concrete version from a dependency range", () => {
    expect(declaredVersion("^0.12.0")).toBe("0.12.0");
  });
});
