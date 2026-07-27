import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { SKYFE_CODES, aggregateReport, bucket } from "./doctor.mjs";

// The doctor aggregates the whole lint surface + the fullstack loops into one report. Pin the bucketing, the
// error/warn tallies, the per-rule file counts, and the clean-SKYFE roster (the promotion-candidate view).
describe("bucket", () => {
  it("routes SKYFE, community, and platform rules", () => {
    expect(bucket("skies/view-purity")).toBe("skyfe");
    expect(bucket("@tanstack/query/exhaustive-deps")).toBe("community");
    expect(bucket("sonarjs/cognitive-complexity")).toBe("community");
    expect(bucket("@typescript-eslint/no-floating-promises")).toBe("community");
    expect(bucket("react-hooks/set-state-in-effect")).toBe("platform");
    expect(bucket("import/no-duplicates")).toBe("platform");
    expect(bucket(null)).toBe("parse");
  });
});

describe("aggregateReport", () => {
  const eslintResults = [
    {
      filePath: "/app/src/features/auth/Auth.view.tsx",
      messages: [
        { ruleId: "skies/no-hardcoded-copy", severity: 1 },
        { ruleId: "skies/view-purity", severity: 2 },
      ],
    },
    {
      filePath: "/app/src/features/auth/Auth.viewModel.ts",
      messages: [{ ruleId: "skies/mutation-error-handled", severity: 1 }],
    },
    {
      filePath: "/app/src/features/host/Host.view.tsx",
      messages: [{ ruleId: "skies/no-hardcoded-copy", severity: 1 }],
    },
  ];

  it("tallies errors/warnings and per-rule file counts", () => {
    const r = aggregateReport({ eslintResults });
    expect(r.summary).toEqual({ errors: 1, warnings: 3, rules: 3 });
    expect(r.rules["skies/no-hardcoded-copy"]).toMatchObject({ warn: 2, files: 2, bucket: "skyfe", code: "SKYFE014" });
    expect(r.rules["skies/view-purity"]).toMatchObject({ error: 1, code: "SKYFE001" });
    expect(r.ok).toBe(false); // a gated error is present
  });

  it("carries each rule's configured level (incl. for fired rules)", () => {
    const r = aggregateReport({
      eslintResults,
      ruleLevels: { "skies/view-purity": "error", "skies/no-hardcoded-copy": "warn" },
    });
    expect(r.rules["skies/view-purity"].level).toBe("error");
    expect(r.rules["skies/no-hardcoded-copy"].level).toBe("warn");
  });

  it("lists clean SKYFE rules (0 hits) as promotion candidates", () => {
    const r = aggregateReport({
      eslintResults,
      ruleLevels: { "skies/data-door": "error", "skies/state-completeness": "warn" },
    });
    const clean = Object.fromEntries(r.cleanSkyfe.map((c) => [c.code, c.level]));
    // view-purity / no-hardcoded-copy / mutation-error-handled fired -> NOT clean
    expect(clean.SKYFE001).toBeUndefined();
    expect(clean.SKYFE013).toBeUndefined();
    expect(clean.SKYFE014).toBeUndefined();
    // data-door clean + gated; state-completeness clean + warn (promotion candidate)
    expect(clean.SKYFE002).toBe("error");
    expect(clean.SKYFE010).toBe("warn");
    expect(clean.SKYFE035).toBe("?");
  });

  it("is ok when there are no gated errors (warnings are the revealed backlog)", () => {
    const r = aggregateReport({
      eslintResults: [{ filePath: "x", messages: [{ ruleId: "skies/mutation-error-handled", severity: 1 }] }],
      loops: { journey: "8 backend journey(s), 8 linked, 0 parity gap(s)" },
    });
    expect(r.ok).toBe(true);
    expect(r.summary.errors).toBe(0);
    expect(r.loops.journey).toContain("0 parity gap");
  });
});

describe("SKYFE_CODES", () => {
  it("tracks every rule shipped by the plugin", () => {
    const require = createRequire(import.meta.url);
    const plugin = require("../packages/eslint-plugin/index.cjs");

    expect(Object.keys(SKYFE_CODES).sort()).toEqual(
      Object.keys(plugin.rules).map((rule) => `skies/${rule}`).sort(),
    );
  });
});
