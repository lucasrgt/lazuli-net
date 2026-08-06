import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { generateSlice, run } from "./index.js";

const execute = promisify(execFile);
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "skies-node-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("generateSlice", () => {
  it("creates the canonical slice and co-located test", async () => {
    const cwd = await temporaryDirectory();

    const files = await generateSlice({
      cwd,
      root: "src",
      module: "Billing",
      name: "CreateInvoice",
      method: "post",
      route: "/invoices",
    });

    expect(files.map((file) => path.relative(cwd, file))).toEqual([
      path.join("src", "modules", "billing", "slices", "create-invoice.slice.ts"),
      path.join("src", "modules", "billing", "slices", "create-invoice.slice.test.ts"),
    ]);
    const source = await readFile(files[0], "utf8");
    expect(source.indexOf("export type Input")).toBeLessThan(source.indexOf("export interface Output"));
    expect(source.indexOf("export interface Output")).toBeLessThan(source.indexOf("export async function handle"));
    expect(source.indexOf("export async function handle")).toBeLessThan(source.indexOf("export function map"));
    expect(source).toContain('router.post("/invoices", endpoint(');
  });

  it("refuses to overwrite an existing slice", async () => {
    const cwd = await temporaryDirectory();
    const options = {
      cwd,
      root: "src",
      module: "Billing",
      name: "CreateInvoice",
      method: "post" as const,
      route: "/invoices",
    };
    await generateSlice(options);

    await expect(generateSlice(options)).rejects.toThrow("already exists");
  });

  it("supports a dry run without touching the filesystem", async () => {
    const cwd = await temporaryDirectory();
    const files = await generateSlice({
      cwd,
      root: "src",
      module: "Billing",
      name: "GetInvoice",
      method: "get",
      route: "/invoices/:id",
      dryRun: true,
    });

    await expect(readFile(files[0], "utf8")).rejects.toThrow();
  });
});

describe("run", () => {
  it("shows help before attempting project discovery", async () => {
    const messages: string[] = [];

    const exitCode = await run(["--help"], { out: (message) => messages.push(message), error: () => undefined });

    expect(exitCode).toBe(0);
    expect(messages.join("\n")).toContain("Usage:");
  });

  it("ships an executable Node shebang entrypoint", async () => {
    const bin = path.resolve(import.meta.dirname, "../bin/skies-node.mjs");

    const { stdout } = await execute(process.execPath, [bin, "--help"]);

    expect(stdout).toContain("Skies Node.js");
  });
});
