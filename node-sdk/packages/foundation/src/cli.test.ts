import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main, type CliIo } from "./cli.js";

const healthy = {
  schemaVersion: 1,
  git: { base: "HEAD^" },
  criteria: [{ id: "health.live", statement: "The application is live." }],
  lanes: [{ id: "unit", command: [process.execPath, "-e", "process.exit(0)"], timeoutMs: 2_000 }],
  proofs: [{ id: "health-unit", kind: "unit", lane: "unit", criteria: ["health.live"], sourceScopes: ["src/**"] }],
};

function capture(): { io: CliIo; out: () => string; error: () => string } {
  let stdout = ""; let stderr = "";
  return {
    io: { stdout: { write: (value: string | Uint8Array) => { stdout += value.toString(); return true; } }, stderr: { write: (value: string | Uint8Array) => { stderr += value.toString(); return true; } } },
    out: () => stdout, error: () => stderr,
  };
}
async function workspace(config: unknown = healthy): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "skies-cli-"));
  await writeFile(join(root, "skies.node.json"), JSON.stringify(config));
  return root;
}

describe("CLI contract", () => {
  it("prints help without repository discovery", async () => {
    const output = capture();
    expect(await main(["gate", "--help", "--root", "/does/not/exist"], output.io)).toBe(0);
    expect(output.out()).toContain("Exit codes: 0 success; 1");
    expect(output.error()).toBe("");
  });

  it("uses exit 2 for unknown options and invalid configuration", async () => {
    const unknown = capture();
    expect(await main(["inventory", "--wat"], unknown.io)).toBe(2);
    expect(unknown.error()).toContain("unknown option");
    const root = await workspace({ ...healthy, schemaVersion: 9 });
    const invalid = capture();
    expect(await main(["inventory", "--root", root], invalid.io)).toBe(2);
    expect(invalid.error()).toContain("schemaVersion");
  });

  it("emits machine-readable inventory, static matrix, and criteria coverage", async () => {
    const root = await workspace();
    for (const command of ["inventory", "matrix", "criteria"] as const) {
      const output = capture();
      expect(await main([command, "--root", root, "--json"], output.io)).toBe(0);
      expect(() => JSON.parse(output.out())).not.toThrow();
    }
  });

  it("returns finding exit 1 for uncovered criteria", async () => {
    const root = await workspace({ ...healthy, proofs: [] });
    const output = capture();
    expect(await main(["criteria", "--root", root], output.io)).toBe(1);
    expect(output.out()).toContain("NO-PROOF");
  });

  it("strictly validates gate mode combinations", async () => {
    const root = await workspace();
    const conflict = capture();
    expect(await main(["gate", "--base", "HEAD", "--changed", "src/a.ts", "--root", root], conflict.io)).toBe(2);
    expect(conflict.error()).toContain("incompatible with --base");
    const modes = capture();
    expect(await main(["gate", "--staged", "--full", "--root", root], modes.io)).toBe(2);
    expect(modes.error()).toContain("mutually exclusive");
    const fullFast = capture();
    expect(await main(["gate", "--full", "--fast", "--root", root], fullFast.io)).toBe(2);
    expect(fullFast.error()).toContain("conflict");
    const bareBase = capture();
    expect(await main(["gate", "--base", "--root", root], bareBase.io)).toBe(2);
    expect(bareBase.error()).toContain("requires a value");
    const unsafeBase = capture();
    expect(await main(["gate", "--base", "HEAD HEAD", "--root", root], unsafeBase.io)).toBe(2);
    expect(unsafeBase.error()).toContain("safe Git revisions");
  });

  it("rejects the agent-facing WTW collect command as host-only", async () => {
    const root = await workspace();
    await main(["foundations", "init", "--root", root], capture().io);
    const denied = capture();
    expect(await main(["wtw", "collect", "--root", root, "--id", "x", "--title", "X", "--statement", "X.", "--kind", "decision"], denied.io)).toBe(2);
    expect(denied.error()).toContain("unknown wtw operation");
  });

  it("rejects operation-specific CSM flags instead of silently ignoring them", async () => {
    const root = await workspace();
    await main(["foundations", "init", "--root", root], capture().io);
    const output = capture();
    expect(await main(["rtw", "guide", "--root", root, "--id", "ignored"], output.io)).toBe(2);
    expect(output.error()).toContain("not valid for this operation");
  });

  it("runs a JSON gate without contaminating stdout and writes no files when asked", async () => {
    const root = await workspace();
    const output = capture();
    expect(await main(["gate", "--affected", "--changed", "src/a.ts", "--root", root, "--no-report", "--json"], output.io)).toBe(0);
    const receipt = JSON.parse(output.out()) as { verdict: string; selectedProofs: string[] };
    expect(receipt).toMatchObject({ verdict: "green", selectedProofs: ["health-unit"] });
  });

  it("installs and operates the local CSM stack with dry-run and JSON", async () => {
    const root = await workspace();
    const dry = capture();
    expect(await main(["foundations", "init", "--root", root, "--dry-run", "--json"], dry.io)).toBe(0);
    expect(JSON.parse(dry.out())).toMatchObject({ dryRun: true });
    const install = capture();
    expect(await main(["foundation", "stack", "init", "--root", root], install.io)).toBe(0);
    const add = capture();
    expect(await main(["rtw", "add", "--root", root, "--id", "tests", "--title", "Tests", "--guidance", "Keep tests under src.", "--json"], add.io)).toBe(0);
    const guide = capture();
    expect(await main(["rtw", "guide", "--root", root], guide.io)).toBe(0);
    expect(guide.out()).toContain("Keep tests under src");
  });

  it("composes check in gate, WTW, RTW, NYA, NWC order and requires an explicit mode", async () => {
    const root = await workspace();
    await main(["foundations", "init", "--root", root], capture().io);
    const ambiguous = capture();
    expect(await main(["check", "--task", "review", "--root", root], ambiguous.io)).toBe(2);
    const output = capture();
    expect(await main(["foundation", "workflow", "check", "--task", "review", "--affected", "--changed", "src/a.ts", "--root", root, "--no-report", "--json"], output.io)).toBe(0);
    expect((JSON.parse(output.out()) as { steps: { id: string }[] }).steps.map((step) => step.id)).toEqual(["gate", "wtw", "rtw", "nya", "nwc"]);
    const staged = capture();
    // Without a Git checkout a staged check fails closed and bounded instead of widening to the full inventory.
    expect(await main(["foundation", "workflow", "check", "--task", "review", "--staged", "--root", root, "--no-report", "--json"], staged.io)).toBe(1);
    expect(staged.out()).toContain("staged discovery failed");
    const fastBase = capture();
    // Without a Git checkout a base-relative fast check fails closed and bounded, never widening.
    expect(await main(["foundation", "workflow", "check", "--task", "review", "--base", "HEAD^", "--fast", "--root", root, "--no-report", "--json"], fastBase.io)).toBe(1);
    expect(fastBase.out()).toContain("base discovery failed");
    expect((JSON.parse(fastBase.out()) as { steps: { id: string }[] }).steps.map((step) => step.id)).toEqual(["gate", "wtw", "rtw", "nya", "nwc"]);
  });
});
