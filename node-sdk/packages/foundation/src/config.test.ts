import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";
import { buildInventory, coverageRows, criteriaFindings } from "./inventory.js";

function manifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    git: { base: "origin/main" },
    criteria: [
      { id: "wallet.withdraw", statement: "A withdrawal cannot overdraw." },
      { id: "wallet.audit", statement: "A withdrawal is auditable." },
    ],
    lanes: [
      { id: "unit", command: ["node", "--test", "src/wallet.test.js"], timeoutMs: 5_000, cwd: "." },
      { id: "journey", command: ["node", "journey.js"], timeoutMs: 30_000, env: { NODE_ENV: "test" } },
    ],
    proofs: [
      { id: "withdraw-unit", kind: "unit", lane: "unit", criteria: ["wallet.withdraw"], sourceScopes: ["src/wallet/**"] },
      { id: "withdraw-journey", kind: "journey", lane: "journey", criteria: ["wallet.audit"], sourceScopes: ["src/wallet/**"], dependsOn: ["withdraw-unit"] },
    ],
    ignoreScopes: ["docs/**"],
    forceFullScopes: ["package.json"],
    ...overrides,
  });
}

describe("strict manifest parsing", () => {
  it("normalizes a complete explicit proof topology", () => {
    const config = parseConfig(manifest(), "/repo/skies.node.json", "/repo");
    expect(config.schemaVersion).toBe(1);
    expect(config.lanes[1]).toMatchObject({ cwd: ".", env: { NODE_ENV: "test" } });
    expect(config.proofs.map((proof) => proof.kind)).toEqual(["unit", "journey"]);
    expect(config.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it.each([
    [{ extra: true }, "unknown key"],
    [{ schemaVersion: 2 }, "schemaVersion"],
    [{ lanes: [{ id: "bad", command: [], timeoutMs: 100 }] }, "must not be empty"],
    [{ lanes: [{ id: "bad", command: ["x"], timeoutMs: 99 }] }, "timeoutMs"],
    [{ criteria: [{ id: "same", statement: "one" }, { id: "same", statement: "two" }] }, "duplicate"],
    [{ proofs: [{ id: "p", kind: "unit", lane: "missing", criteria: ["wallet.withdraw"], sourceScopes: ["src/**"] }] }, "unknown lane"],
    [{ proofs: [{ id: "p", kind: "unit", lane: "unit", criteria: ["unknown"], sourceScopes: ["src/**"] }] }, "unknown criterion"],
    [{ proofs: [{ id: "p", kind: "other", lane: "unit", criteria: ["wallet.withdraw"], sourceScopes: ["src/**"] }] }, "kind"],
    [{ proofs: [{ id: "p", kind: "unit", lane: "unit", criteria: ["wallet.withdraw", "wallet.withdraw"], sourceScopes: ["src/**"] }] }, "duplicate"],
    [{ proofs: [{ id: "p", kind: "unit", lane: "unit", criteria: ["wallet.withdraw"], sourceScopes: ["../src/**"] }] }, "parent"],
  ])("rejects invalid configuration %#", (override, message) => {
    expect(() => parseConfig(manifest(override), "config", "/repo")).toThrow(message);
  });

  it("rejects unknown dependencies and cycles", () => {
    const common = { kind: "unit", lane: "unit", criteria: ["wallet.withdraw"], sourceScopes: ["src/**"] };
    expect(() => parseConfig(manifest({ proofs: [{ id: "a", ...common, dependsOn: ["nope"] }] }), "c", "/r")).toThrow("unknown proof");
    expect(() => parseConfig(manifest({ proofs: [
      { id: "a", ...common, dependsOn: ["b"] },
      { id: "b", ...common, dependsOn: ["a"] },
    ] }), "c", "/r")).toThrow("cycle");
  });
});

describe("inventory and criteria coverage", () => {
  it("carries commands, timeouts, scopes and kind counts", () => {
    const inventory = buildInventory(parseConfig(manifest(), "config", "/repo"));
    expect(inventory.counts).toEqual({ unit: 1, integration: 0, e2e: 0, journey: 1 });
    expect(inventory.proofs[0]).toMatchObject({
      command: ["node", "--test", "src/wallet.test.js"], timeoutMs: 5_000,
      sourceScopes: ["src/wallet/**"], criteria: ["wallet.withdraw"],
    });
  });

  it("reports an uncovered criterion as no-proof, never pass", () => {
    const config = parseConfig(manifest({ proofs: [] }), "config", "/repo");
    expect(coverageRows(config).map((row) => row.outcome)).toEqual(["no-proof", "no-proof"]);
    expect(criteriaFindings(config)).toContain("no proofs are declared");
  });
});
