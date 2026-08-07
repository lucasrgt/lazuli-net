import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { DefaultGitClient, defaultCommandRunner } from "./runner.js";

const execute = promisify(execFile);

describe("process runner", () => {
  it.skipIf(process.platform === "win32")("uses argv without shell interpolation on POSIX hosts", async () => {
    const marker = join(await mkdtemp(join(tmpdir(), "skies-runner-")), "should-not-exist");
    const argument = `literal;require('node:fs').writeFileSync('${marker}','bad')`;
    const result = await defaultCommandRunner({
      command: [process.execPath, "-e", "process.stdout.write(process.argv[1])", argument],
      cwd: process.cwd(), env: {}, timeoutMs: 2_000, forwardOutput: false,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(argument);
  });

  it("times out and fails closed", async () => {
    const result = await defaultCommandRunner({
      command: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
      cwd: process.cwd(), env: {}, timeoutMs: 100, forwardOutput: false,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode === 0).toBe(false);
    expect(result.durationMs).toBeLessThan(1_500);
  });

  it("reports a missing executable rather than throwing it away", async () => {
    const result = await defaultCommandRunner({
      command: ["definitely-not-a-skies-executable"], cwd: process.cwd(), env: {}, timeoutMs: 500, forwardOutput: false,
    });
    if (process.platform === "win32") {
      // cmd.exe reports the missing command as a plain exit-1 without a spawn error.
      expect(result.exitCode).not.toBeNull();
      expect(result.error).toBeUndefined();
      return;
    }
    expect(result.exitCode).toBeNull();
    expect(result.error).toMatch(/ENOENT|not found/iu);
  });
});

describe("Git impact discovery", () => {
  it("joins merge-base changes, working changes and untracked files deterministically", async () => {
    const root = await mkdtemp(join(tmpdir(), "skies-git-"));
    await execute("git", ["init", "-q"], { cwd: root });
    await execute("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    await execute("git", ["config", "user.name", "Test"], { cwd: root });
    await writeFile(join(root, "base.txt"), "base\n");
    await execute("git", ["add", "."], { cwd: root });
    await execute("git", ["commit", "-qm", "base"], { cwd: root });
    const { stdout: base } = await execute("git", ["rev-parse", "HEAD"], { cwd: root });
    await writeFile(join(root, "committed.txt"), "commit\n");
    await execute("git", ["add", "."], { cwd: root });
    await execute("git", ["commit", "-qm", "change"], { cwd: root });
    await writeFile(join(root, "base.txt"), "working\n");
    await writeFile(join(root, "untracked.txt"), "new\n");
    const paths = await new DefaultGitClient().changedPaths(root, base.trim());
    expect(paths).toEqual(["base.txt", "committed.txt", "untracked.txt"]);
  });
});
