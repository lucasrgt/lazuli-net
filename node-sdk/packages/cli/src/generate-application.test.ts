import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateApplication,
  generateAuth,
  generatePage,
  generateSlice,
  generateStorage,
  generateValueObject,
} from "./index.js";

const execute = promisify(execFile);
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "skies-node-new-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function missing(target: string): Promise<void> {
  await expect(readFile(target)).rejects.toMatchObject({ code: "ENOENT" });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("generateApplication", () => {
  it("dry-runs the complete ordered plan without creating its directory", async () => {
    const cwd = await temporaryDirectory();

    const first = await generateApplication({ cwd, directory: "payments-api", dryRun: true });
    const second = await generateApplication({ cwd, directory: "payments-api", dryRun: true });

    expect(second).toEqual(first);
    expect(first).toHaveLength(32);
    expect(first[0]).toBe(path.join(cwd, "payments-api/package.json"));
    expect(first.at(-1)).toBe(path.join(cwd, "payments-api/src/modules/health/ping.slice.test.ts"));
    expect(first).toContain(path.join(cwd, "payments-api/.githooks/pre-commit"));
    expect(first).toContain(path.join(cwd, "payments-api/.skies/csm/lock.json"));
    expect(await readdir(cwd)).toEqual([]);
  });

  it("preflights one starter collision before writing any other file", async () => {
    const cwd = await temporaryDirectory();
    const target = path.join(cwd, "payments-api");
    await mkdir(target);
    await writeFile(path.join(target, "package.json"), "keep\n");

    await expect(generateApplication({ cwd, directory: "payments-api" })).rejects.toThrow("already exists");

    expect(await readFile(path.join(target, "package.json"), "utf8")).toBe("keep\n");
    expect(await readdir(target)).toEqual(["package.json"]);
  });

  it("updates a current module transactionally when generating a slice", async () => {
    const cwd = await temporaryDirectory();
    const [packageFile] = await generateApplication({ cwd, directory: "payments-api" });
    const app = path.dirname(packageFile!);
    const moduleFile = path.join(app, "src/modules/health/health.module.ts");
    const before = await readFile(moduleFile);
    const collision = path.join(app, "src/modules/health/slices/check-dependencies.slice.test.ts");
    await mkdir(path.dirname(collision), { recursive: true });
    await writeFile(collision, "keep test\n");
    const options = {
      cwd: app,
      root: "src",
      module: "Health",
      name: "CheckDependencies",
      method: "get" as const,
      route: "/health/dependencies",
    };

    await expect(generateSlice(options)).rejects.toThrow("already exists");
    expect(await readFile(moduleFile)).toEqual(before);
    await missing(path.join(path.dirname(collision), "check-dependencies.slice.ts"));

    await unlink(collision);
    const files = await generateSlice(options);
    const module = await readFile(moduleFile, "utf8");
    expect(files).toHaveLength(4);
    expect(module).toContain('import * as CheckDependencies from "./slices/check-dependencies.slice.js";');
    expect(module).toContain("CheckDependencies.map(router, openApi);");
  });

  it("produces a no-network installed fixture that passes lint, typecheck, test, doctor, and build", async () => {
    const cwd = await temporaryDirectory();
    const [packageFile] = await generateApplication({ cwd, directory: "payments-api" });
    const app = path.dirname(packageFile!);
    const common = { cwd: app, root: "src" };
    if (process.platform !== "win32") {
      expect((await stat(path.join(app, ".githooks/pre-commit"))).mode & 0o111).not.toBe(0);
    }
    await generateSlice({
      ...common,
      module: "Health",
      name: "CheckDependencies",
      method: "post",
      route: "/health/dependencies",
    });
    await generateValueObject({ ...common, module: "Health", name: "ProbeId" });
    await generatePage({ ...common, module: "Health", name: "Probe" });
    await generateStorage(common);
    await generateAuth(common);
    const workspaceModules = path.resolve(import.meta.dirname, "../../../node_modules");
    await symlink(workspaceModules, path.join(app, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    // A real generated app lives in a Git repository with an origin/main base; the pre-push base gate
    // resolves origin/main...HEAD and stays bounded instead of widening.
    await execute("git", ["init", "-q"], { cwd: app });
    await execute("git", ["config", "user.email", "fixture@example.test"], { cwd: app });
    await execute("git", ["config", "user.name", "Fixture"], { cwd: app });
    await execute("git", ["add", "-A"], { cwd: app });
    await execute("git", ["commit", "-q", "-m", "fixture"], { cwd: app });
    await execute("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: app });
    const outputs: string[] = [];

    for (const script of ["lint", "typecheck", "test", "doctor", "build", "proofs", "criteria"]) {
      const result = await execute(npm, ["run", script], { cwd: app, maxBuffer: 10 * 1024 * 1024 });
      outputs.push(result.stdout);
    }
    for (const args of [
      ["run", "gate:affected", "--", "--changed", "src/modules/health/ping.slice.ts"],
      ["run", "gate:base"],
      ["run", "gate:full"],
      ["run", "foundations:sync", "--", "--dry-run"],
    ]) {
      const result = await execute(npm, args, { cwd: app, maxBuffer: 10 * 1024 * 1024 });
      outputs.push(result.stdout);
    }

    expect(outputs[0]).toContain("> eslint .");
    expect(outputs[1]).toContain("> tsc -p tsconfig.test.json");
    expect(outputs[2]).toContain("10 passed");
    expect(outputs[3]).toContain("doctor passed");
    expect(outputs[4]).toContain("> tsc -p tsconfig.json");
    expect(outputs[5]).toContain("Skies Node proof inventory");
    expect(outputs[6]).toContain("COVERED");
    expect(outputs[7]).toContain("Gate verdict: GREEN");
    expect(outputs[8]).toContain("Gate verdict: NO-CHANGES");
    expect(outputs[9]).toContain("Gate verdict: GREEN");
    expect(await readFile(path.join(app, "VERIFICATION.json"), "utf8")).toContain('"verdict": "green"');
    expect(await readFile(path.join(app, "VERIFICATION.md"), "utf8")).toContain("# Verification matrix");
    expect(await readFile(path.join(app, ".skies/foundation/vitest-receipt.json"), "utf8"))
      .toContain('"verdict": "green"');
    expect(await readFile(path.join(app, ".gitignore"), "utf8")).toContain("vitest-receipt.json");
    expect(await readFile(path.join(app, "dist/server.js"), "utf8")).toContain("app.listen(port");
  }, 240_000);
});
