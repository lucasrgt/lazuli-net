import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@hey-api/openapi-ts";
import ts from "typescript";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { createOpenApiDocument, createOpenApiRegistry, defineContract } from "./index.js";

const createWallet = defineContract({
  operationId: "CreateWallet",
  method: "post",
  path: "/wallets",
  auth: "required",
  kind: "app",
  request: { body: z.object({ amount: z.number().positive(), nickname: z.string().optional() }) },
  success: { status: 201, output: z.object({ walletId: z.string(), balance: z.number() }) },
});
const internalHealth = defineContract({
  operationId: "InternalHealth",
  method: "get",
  path: "/health",
  auth: "anonymous",
  kind: "internal",
  request: {},
  success: { status: 200, output: z.object({ status: z.literal("ok") }) },
});

describe("generated app client", () => {
  it("turns the app projection into declarations consumed by strict TypeScript", { timeout: 30_000 }, async () => {
    const registry = createOpenApiRegistry({ title: "Client smoke", version: "1" });
    registry.registerContract(internalHealth);
    registry.registerContract(createWallet);
    const document = createOpenApiDocument(registry, { audience: "app-client" });
    const directory = await mkdtemp(join(tmpdir(), "skies-openapi-client-"));

    try {
      const specification = join(directory, "openapi.json");
      const generatedDirectory = join(directory, "generated");
      const consumer = join(directory, "consumer.ts");
      await writeFile(specification, `${JSON.stringify(document)}\n`);
      await createClient({
        input: specification,
        output: generatedDirectory,
        plugins: ["@hey-api/typescript"],
      });
      await writeFile(consumer, `import type { CreateWalletData, CreateWalletResponses } from "./generated/index.js";
const request: NonNullable<CreateWalletData["body"]> = { amount: 25 };
const response: CreateWalletResponses[201] = { walletId: "wallet-1", balance: request.amount };
void response;
`);
      const generated = await readFile(join(generatedDirectory, "types.gen.ts"), "utf8");
      const program = ts.createProgram(
        [consumer, join(generatedDirectory, "index.ts"), join(generatedDirectory, "types.gen.ts")],
        {
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        },
      );
      const diagnostics = ts.getPreEmitDiagnostics(program);

      expect(generated).toContain("CreateWalletData");
      expect(generated).not.toContain("InternalHealth");
      expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")))
        .toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
