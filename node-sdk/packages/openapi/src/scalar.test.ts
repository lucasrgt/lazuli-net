import { Errors, Result, scalarCodec } from "@skiesjs/core";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  createOpenApiDocument,
  createOpenApiRegistry,
  defineContract,
  encodeContractOutput,
  scalarSchema,
} from "./index.js";

interface Cents { readonly value: number }

const cents = scalarCodec<Cents, number>({
  primitive: { type: "integer", format: "int64" },
  encode: (value) => value.value,
  decode: (value) => value >= 0
    ? Result.ok({ value })
    : Result.fail(Errors.validation("money.cents.negative", "cents cannot be negative")),
});
const centsSchema = scalarSchema(cents);

const contract = defineContract({
  operationId: "EchoAmount",
  method: "post",
  path: "/amounts",
  auth: "anonymous",
  kind: "app",
  request: { body: z.object({ amount: centsSchema }) },
  success: { status: 200, output: z.object({ amount: centsSchema }) },
});

describe("scalarSchema", () => {
  it("decodes through the smart constructor and preserves its failure", () => {
    expect(centsSchema.safeParse(25)).toEqual({ success: true, data: { value: 25 } });
    const invalid = centsSchema.safeParse(-1);
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues[0]).toMatchObject({
        code: "custom",
        message: "cents cannot be negative",
        params: { skiesCode: "money.cents.negative" },
      });
    }
  });

  it("encodes domain output back to the primitive wire shape", () => {
    expect(encodeContractOutput(contract, { amount: { value: 42 } })).toEqual({ amount: 42 });
  });

  it("emits the same primitive schema for inbound and outbound OpenAPI components", () => {
    const registry = createOpenApiRegistry({ title: "Money API", version: "1" });
    registry.registerContract(contract);
    const document = createOpenApiDocument(registry);
    const schemas = document.components.schemas as Record<string, any>;

    expect(schemas.EchoAmountBody.properties.amount).toMatchObject({ type: "integer", format: "int64" });
    expect(schemas.EchoAmountOutput.properties.amount).toMatchObject({ type: "integer", format: "int64" });
  });
});
