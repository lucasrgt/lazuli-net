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
          "@skiesjs/frontend-sdk": `^${canonical.find((entry) => entry.name === "@skiesjs/frontend-sdk")?.version}`,
          "assay-design": `^${canonical.find((entry) => entry.name === "assay-design")?.version}`,
          "avp-assay": `^${canonical.find((entry) => entry.name === "avp-assay")?.version}`,
          "@skiesjs/eslint-plugin": `^${canonical.find((entry) => entry.name === "@skiesjs/eslint-plugin")?.version}`,
          "@skiesjs/react": `~${canonical.find((entry) => entry.name === "@skiesjs/react")?.version}`,
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
          "@skiesjs/frontend-sdk": "^0.1.0",
          "@skiesjs/eslint-plugin": "^0.10.0",
        },
      }],
      hasFrontend: true,
      vendoredMirror: false,
    });
    expect(result.status).toBe("drifted");
    expect(result.messages.join("\n")).toContain("0.10.0");
    expect(result.messages.join("\n")).toContain("@skiesjs/react");
    expect(result.messages.join("\n")).toContain("avp-assay");
    expect(result.messages.join("\n")).toContain("assay-design");
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
