import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateApplication,
  generateAuth,
  generateAuthAugment,
  generateCrud,
  generateEntity,
  generateHub,
  generateModule,
  run,
} from "./index.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "skies-node-final-generators-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function application(): Promise<string> {
  const root = await temporaryDirectory();
  const [packageFile] = await generateApplication({ cwd: root, directory: "app" });
  return path.dirname(packageFile!);
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("entity, CRUD, hub, and auth augment generators", () => {
  it("creates an explicit PostgreSQL table, migration, and runnable shape proof", async () => {
    const cwd = await temporaryDirectory();
    const files = await generateEntity({ cwd, root: "src", module: "Billing", name: "Invoice" });

    expect(files.map((file) => path.relative(cwd, file))).toEqual([
      path.join("src", "modules", "billing", "entities", "invoice.entity.ts"),
      path.join("src", "modules", "billing", "entities", "invoice.entity.test.ts"),
      path.join("src", "modules", "billing", "migrations", "0001-create-invoices.sql"),
    ]);
    const entity = await readFile(files[0]!, "utf8");
    const migration = await readFile(files[2]!, "utf8");
    expect(entity).toContain('pgTable("billing_invoices"');
    expect(entity).toContain('orgId: uuid("org_id").notNull()');
    expect(entity).toContain('version: integer("version").notNull().default(0)');
    expect(migration).toContain("CHECK (version >= 0)");
    expect(entity).not.toContain("BaseEntity");
  });

  it("applies one CRUD plan with concrete Drizzle policies, exact proofs, wiring, and manifest updates", async () => {
    const cwd = await application();
    await generateModule({ cwd, root: "src", module: "Billing" });

    const files = await generateCrud({ cwd, root: "src", module: "Billing", name: "Invoice" });

    const query = await readFile(path.join(cwd, "src/modules/billing/queries/invoice.queries.ts"), "utf8");
    const module = await readFile(path.join(cwd, "src/modules/billing/billing.module.ts"), "utf8");
    const manifest = await readFile(path.join(cwd, "skies.node.json"), "utf8");
    expect(query).toContain("pagePolicy({");
    expect(query).toContain("toPage({");
    expect(query).toContain("executeVersionedMutation");
    expect(query).not.toContain("Repository");
    expect(module).toContain("dependencies.invoiceQueries ?? unconfiguredInvoiceQueries");
    expect(module).toContain("openApi.registerErrorCodes(InvoiceErrorCodes)");
    expect(manifest).toContain('"billing.invoice.create"');
    expect(manifest).toContain('"billing.invoice.delete"');
    expect(files).toContain(path.join(cwd, "src/modules/billing/slices/update-invoice.slice.journey.ts"));
  });

  it("preflights a CRUD collision before replacing the module or manifest", async () => {
    const cwd = await application();
    await generateModule({ cwd, root: "src", module: "Billing" });
    const moduleFile = path.join(cwd, "src/modules/billing/billing.module.ts");
    const manifestFile = path.join(cwd, "skies.node.json");
    const collision = path.join(cwd, "src/modules/billing/slices/get-invoice.slice.test.ts");
    await mkdir(path.dirname(collision), { recursive: true });
    await writeFile(collision, "authored\n");
    const beforeModule = await readFile(moduleFile);
    const beforeManifest = await readFile(manifestFile);

    await expect(generateCrud({ cwd, root: "src", module: "Billing", name: "Invoice" })).rejects.toThrow(
      "already exists",
    );

    expect(await readFile(moduleFile)).toEqual(beforeModule);
    expect(await readFile(manifestFile)).toEqual(beforeManifest);
    expect(await readFile(collision, "utf8")).toBe("authored\n");
  });

  it("targets the real Socket.IO API and makes focused auth prerequisites and collisions explicit", async () => {
    const cwd = await application();
    const initialPackage = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(initialPackage.dependencies["@skiesjs/socketio"]).toBeUndefined();
    expect(initialPackage.dependencies["socket.io"]).toBeUndefined();
    await generateModule({ cwd, root: "src", module: "Billing" });
    const hub = await generateHub({ cwd, root: "src", module: "Billing", name: "Updates" });
    const packageAfterHub = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(packageAfterHub.dependencies["@skiesjs/socketio"]).toBe("0.1.0");
    expect(packageAfterHub.dependencies["socket.io"]).toBe("^4.8.3");
    const hubSource = await readFile(hub[0]!, "utf8");
    expect(hubSource).toContain("defineSocketEvent");
    expect(hubSource).toContain("adapter.register(contract, handle)");
    expect(hubSource).not.toContain("defineSocketContract");

    await expect(generateAuthAugment({ cwd, root: "src", mode: "otp" })).rejects.toThrow("run g auth first");
    await generateAuth({ cwd, root: "src" });
    const otp = await generateAuthAugment({ cwd, root: "src", mode: "otp" });
    expect(await readFile(otp[0]!, "utf8")).toContain('invalid: "auth.otp.invalid"');
    expect(await readFile(otp[1]!, "utf8")).toContain("codeDigest");
    expect(await readFile(otp[1]!, "utf8")).not.toContain("provider SDK");
    await expect(generateAuthAugment({ cwd, root: "src", mode: "otp" })).rejects.toThrow(/already (?:exists|declares)/u);
  });

  it("keeps CLI options strict", async () => {
    const cwd = await temporaryDirectory();
    const errors: string[] = [];
    const code = await run(["g", "entity", "Billing", "Invoice", "extra", "--cwd", cwd], {
      out: () => undefined,
      error: (message) => errors.push(message),
    });

    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("unknown argument: extra");
    await expect(readFile(path.join(cwd, "src/modules/billing/entities/invoice.entity.ts"))).rejects.toThrow();
  });
});
