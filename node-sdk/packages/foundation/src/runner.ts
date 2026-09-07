import { execFile, spawn } from "node:child_process";
import { basename, relative, resolve } from "node:path";
import type { ChildProcess } from "node:child_process";
import type { CommandRequest, CommandResult, CommandRunner, GitClient } from "./types.js";

const CAPTURE_LIMIT = 64 * 1024;

function append(current: string, chunk: Buffer | string): string {
  if (current.length >= CAPTURE_LIMIT) return current;
  const next = current + chunk.toString();
  return next.length <= CAPTURE_LIMIT ? next : `${next.slice(0, CAPTURE_LIMIT)}
[output truncated]`;
}

function terminate(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") {
      // Killing only cmd.exe or the parent Node process leaves test/browser descendants consuming resources
      // and holding inherited pipes open. Windows needs explicit process-tree termination.
      execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
    }
    else process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* the process already ended */ }
  }
}

export const defaultCommandRunner: CommandRunner = async (request) => new Promise((complete) => {
  const started = performance.now();
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let spawnError: string | undefined;
  let settled = false;
  const child = spawn(request.command[0], request.command.slice(1), {
    cwd: request.cwd,
    env: { ...process.env, ...request.env },
    // Only command shims need cmd.exe. Native executables must retain their argv boundaries on Windows too.
    shell: process.platform === "win32"
      && /^(?:npm|npx|pnpm|yarn|corepack)(?:\.cmd)?$|\.(?:cmd|bat)$/iu.test(basename(request.command[0])),
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout = append(stdout, chunk);
    if (request.forwardOutput) process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = append(stderr, chunk);
    if (request.forwardOutput) process.stderr.write(chunk);
  });
  child.on("error", (error) => { spawnError = error.message; });

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  const listeners = new Map<NodeJS.Signals, () => void>();
  for (const signal of signals) {
    const listener = (): void => terminate(child, signal);
    listeners.set(signal, listener);
    process.once(signal, listener);
  }
  const killTimer = { value: undefined as NodeJS.Timeout | undefined };
  const timer = setTimeout(() => {
    timedOut = true;
    terminate(child, "SIGTERM");
    killTimer.value = setTimeout(() => terminate(child, "SIGKILL"), 1_000);
    killTimer.value.unref();
  }, request.timeoutMs);
  timer.unref();

  child.on("close", (exitCode, signal) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (killTimer.value !== undefined) clearTimeout(killTimer.value);
    for (const [name, listener] of listeners) process.removeListener(name, listener);
    const base = {
      exitCode: spawnError === undefined ? exitCode : null,
      signal,
      timedOut,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      stdout,
      stderr,
    };
    complete(spawnError === undefined ? base : { ...base, error: spawnError });
  });
});

function execGit(args: readonly string[], cwd: string): Promise<string> {
  return new Promise((complete, reject) => {
    execFile("git", [...args], { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error !== null) reject(new Error(`git ${args.join(" ")} failed: ${stderr.trim() || error.message}`));
        else complete(stdout);
      });
  });
}

function nulPaths(output: string): string[] {
  return output.split("\0").filter((item) => item.length > 0);
}

// Git reports worktree-root-relative paths, but source scopes are relative to the workspace root the gate
// runs from (a generated app, or a sample inside a monorepo). Rewrite paths beneath that root to root-relative
// form; paths outside it stay worktree-relative and fall through fail-closed mapping.
async function rootRelative(root: string, paths: readonly string[], cwd: string): Promise<string[]> {
  const base = resolve(root);
  const top = (await execGit(["rev-parse", "--show-toplevel"], cwd)).trim();
  if (top.length === 0) return [...paths];
  return paths.map((path) => {
    const absolute = resolve(top, path);
    const rel = relative(base, absolute);
    return rel.startsWith("..") || rel.startsWith(`..${"/"}`)
      ? path
      : rel.replaceAll("\\", "/");
  });
}

export class DefaultGitClient implements GitClient {
  async changedPaths(root: string, baseRevision: string): Promise<readonly string[]> {
    if (baseRevision.startsWith("-") || /[\u0000-\u0020]/u.test(baseRevision)) throw new Error("unsafe Git base revision");
    const cwd = resolve(root);
    const mergeBase = (await execGit(["merge-base", baseRevision, "HEAD"], cwd)).trim();
    if (mergeBase.length === 0) throw new Error(`git merge-base ${baseRevision} HEAD returned no revision`);
    const outputs = await Promise.all([
      execGit(["diff", "--name-only", "-z", "--diff-filter=ACDMRTUXB", mergeBase, "HEAD"], cwd),
      execGit(["diff", "--name-only", "-z", "--diff-filter=ACDMRTUXB"], cwd),
      execGit(["diff", "--cached", "--name-only", "-z", "--diff-filter=ACDMRTUXB"], cwd),
      execGit(["ls-files", "--others", "--exclude-standard", "-z"], cwd),
    ]);
    return [...new Set(await rootRelative(root, outputs.flatMap(nulPaths), cwd))].sort((left, right) => left.localeCompare(right));
  }

  async stagedPaths(root: string): Promise<readonly string[]> {
    const cwd = resolve(root);
    const output = await execGit(["diff", "--cached", "--name-only", "--diff-filter=ACDMRTUXB", "-z", "--"], cwd);
    return rootRelative(root, nulPaths(output), cwd);
  }

  async baseDiffPaths(root: string, baseRevision: string): Promise<readonly string[]> {
    if (baseRevision.startsWith("-") || /[\u0000-\u0020]/u.test(baseRevision)) throw new Error("unsafe Git base revision");
    const cwd = resolve(root);
    const output = await execGit(["diff", "--name-only", "--diff-filter=ACDMRTUXB", "-z", `${baseRevision}...HEAD`, "--"], cwd);
    return rootRelative(root, nulPaths(output), cwd);
  }
}
