import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateAuth,
  generateErrorCode,
  generatePage,
  generateStorage,
  generateValueObject,
  run,
} from "./index.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "skies-node-domain-generators-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function missing(target: string): Promise<void> {
  await expect(readFile(target)).rejects.toMatchObject({ code: "ENOENT" });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("domain generators", () => {
  it("dry-runs and then creates a stable error-code registry", async () => {
    const cwd = await temporaryDirectory();
    const options = { cwd, root: "src", module: "Billing", name: "InvoiceNotFound" };

    const dryRun = await generateErrorCode({ ...options, dryRun: true });

    expect(dryRun).toEqual([path.join(cwd, "src/modules/billing/billing.errors.ts")]);
    expect(await readdir(cwd)).toEqual([]);

    const [file] = await generateErrorCode(options);
    expect(await readFile(file!, "utf8")).toBe(`import { Errors, type SkiesError } from "@skiesjs/core";
import { defineErrorCodes } from "@skiesjs/openapi";

export const BillingErrorCodes = defineErrorCodes({
  invoiceNotFound: "billing.invoice_not_found",
});

export function invoiceNotFoundError(message: string): SkiesError {
  return Errors.businessRule(BillingErrorCodes.invoiceNotFound, message);
}
`);
    await expect(generateErrorCode(options)).rejects.toThrow("already exists");
  });

  it("keeps every value-object target absent when any one target collides", async () => {
    const cwd = await temporaryDirectory();
    const directory = path.join(cwd, "src/modules/billing/values");
    const test = path.join(directory, "invoice-id.test.ts");
    await mkdir(directory, { recursive: true });
    await writeFile(test, "authored test\n");

    await expect(generateValueObject({ cwd, root: "src", module: "Billing", name: "InvoiceId" })).rejects.toThrow(
      "already exists",
    );

    expect(await readFile(test, "utf8")).toBe("authored test\n");
    await missing(path.join(directory, "invoice-id.ts"));
    await missing(path.join(directory, "invoice-id.errors.ts"));
  });

  it("creates the scalar codec, Zod adapter, registry, and runnable test together", async () => {
    const cwd = await temporaryDirectory();

    const files = await generateValueObject({ cwd, root: "src", module: "Billing", name: "InvoiceId" });
    const source = await readFile(files[1]!, "utf8");
    const errors = await readFile(files[0]!, "utf8");

    expect(files).toHaveLength(3);
    expect(source).toContain("scalarCodec<InvoiceId, string>");
    expect(source).toContain("scalarSchema(invoiceIdCodec)");
    expect(source).toContain("Errors.validation(InvoiceIdErrorCodes.invalid");
    expect(errors).toContain('invalid: "billing.invoice_id.invalid"');
  });

  it("creates an explicit Page projection and wire schema without overwriting", async () => {
    const cwd = await temporaryDirectory();
    const options = { cwd, root: "src", module: "Billing", name: "Invoice" };

    const files = await generatePage(options);
    const source = await readFile(files[0]!, "utf8");

    expect(source).toContain("export type InvoicePage = Page<InvoicePageItem>");
    expect(source).toContain("return mapPage(page");
    expect(source).toContain("export const invoicePageSchema = z.object");
    await expect(generatePage(options)).rejects.toThrow("already exists");
  });

  it("creates storage and auth wiring as separate transactional pairs", async () => {
    const cwd = await temporaryDirectory();

    const storage = await generateStorage({
      cwd,
      root: "src",
      directory: ".local/files",
      baseUrl: "https://api.example.test/local-files",
      route: "/local-files",
    });
    const auth = await generateAuth({ cwd, root: "src", issuer: "accounts", audience: "accounts-api" });

    expect(await readFile(storage[0]!, "utf8")).toContain("mapLocalFiles(app, files");
    expect(await readFile(storage[0]!, "utf8")).toContain('routePrefix: "/local-files"');
    expect(await readFile(auth[0]!, "utf8")).toContain("requireJwt(accessTokens)");
    expect(await readFile(auth[0]!, "utf8")).toContain('issuer: "accounts"');
    expect(storage).toHaveLength(2);
    expect(auth).toHaveLength(2);
  });

  it("routes every new generator through the public CLI contract", async () => {
    const cwd = await temporaryDirectory();
    const output: string[] = [];
    const errors: string[] = [];

    const code = await run(["g", "page", "Billing", "Invoice", "--cwd", cwd, "--dry-run"], {
      out: (message) => output.push(message),
      error: (message) => errors.push(message),
    });

    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(output).toHaveLength(2);
    expect(output.every((message) => message.startsWith("would create"))).toBe(true);
    expect(await readdir(cwd)).toEqual([]);
  });
});
