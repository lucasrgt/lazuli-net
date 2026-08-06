import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  createOpenApiDocument,
  createOpenApiRegistry,
  defineContract,
  defineErrorCodes,
} from "./index.js";

const createWallet = defineContract({
  operationId: "CreateWallet",
  method: "post",
  path: "/wallets/{walletId}",
  auth: "required",
  kind: "app",
  request: {
    body: z.object({ amount: z.number().positive(), nickname: z.string().optional() }),
    query: z.object({ notify: z.stringbool().optional() }),
    params: z.object({ walletId: z.string().uuid() }),
    headers: z.object({ "idempotency-key": z.string().min(1) }),
  },
  success: {
    status: 201,
    output: z.object({ walletId: z.string(), balance: z.number() }),
  },
  summary: "Create a wallet",
  tags: ["wallets"],
});

const downloadAsset = defineContract({
  operationId: "DownloadAsset",
  method: "get",
  path: "/assets/{name}",
  auth: "anonymous",
  kind: "asset",
  request: { params: z.object({ name: z.string() }) },
  success: { status: 200, output: z.object({ url: z.string().url() }) },
});

const walletCodes = defineErrorCodes({
  insufficientFunds: "wallets.insufficient_funds",
  notFound: "wallets.not_found",
});
const sharedCodes = defineErrorCodes({
  duplicateNotFound: "wallets.not_found",
  invalidId: "wallet.id.invalid",
});

function registryInOrder(reverse: boolean) {
  const registry = createOpenApiRegistry({ title: "Wallet API", version: "1.2.3" });
  for (const codes of reverse ? [sharedCodes, walletCodes] : [walletCodes, sharedCodes]) {
    registry.registerErrorCodes(codes);
  }
  for (const contract of reverse ? [downloadAsset, createWallet] : [createWallet, downloadAsset]) {
    registry.registerContract(contract);
  }
  return registry;
}

function objectAt(value: unknown, key: string): Record<string, unknown> {
  expect(value).toBeTypeOf("object");
  expect(value).not.toBeNull();
  return (value as Record<string, Record<string, unknown>>)[key] ?? {};
}

describe("createOpenApiDocument", () => {
  it("is independent of explicit registration order and publishes sorted distinct live error codes", () => {
    const forward = createOpenApiDocument(registryInOrder(false));
    const reverse = createOpenApiDocument(registryInOrder(true));

    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse));
    const schemas = objectAt(forward.components, "schemas");
    const errorBody = objectAt(schemas, "ErrorBody");
    const code = objectAt(objectAt(errorBody, "properties"), "code");
    expect(code.enum).toEqual([
      "wallet.id.invalid",
      "wallets.insufficient_funds",
      "wallets.not_found",
    ]);
  });

  it("reads error-code registries at document generation time", () => {
    const registry = createOpenApiRegistry({ title: "Live API", version: "1" });
    registry.registerContract(createWallet);
    const before = createOpenApiDocument(registry);
    registry.registerErrorCodes(walletCodes);
    const after = createOpenApiDocument(registry);

    const codes = (document: typeof before) => objectAt(
      objectAt(objectAt(objectAt(document.components, "schemas"), "ErrorBody"), "properties"),
      "code",
    ).enum;
    expect(codes(before)).toBeUndefined();
    expect(codes(after)).toEqual(["wallets.insufficient_funds", "wallets.not_found"]);
  });

  it("documents all request parts, auth posture, endpoint kind, and nine canonical failures", () => {
    const document = createOpenApiDocument(registryInOrder(false));
    const operation = objectAt(objectAt(document.paths, "/wallets/{walletId}"), "post");
    const responses = operation.responses as Record<string, unknown>;
    const schemas = objectAt(document.components, "schemas");

    expect(Object.keys(responses)).toEqual(["201", "400", "401", "403", "404", "409", "422", "429", "500", "503"]);
    expect(operation.security).toEqual([{ bearerAuth: [] }]);
    expect(operation["x-skies-auth-posture"]).toBe("required");
    expect(operation["x-skies-endpoint-kind"]).toBe("app");
    expect(operation["x-skies-app-client-excluded"]).toBe(false);
    expect(Object.keys(schemas)).toEqual(expect.arrayContaining([
      "CreateWalletBody",
      "CreateWalletHeaders",
      "CreateWalletOutput",
      "CreateWalletParams",
      "CreateWalletQuery",
    ]));
    expect(operation.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ in: "path", name: "walletId", required: true }),
      expect.objectContaining({ in: "query", name: "notify", required: false }),
      expect.objectContaining({ in: "header", name: "idempotency-key", required: true }),
    ]));
  });

  it("excludes non-app operations from the app-client projection", () => {
    const complete = createOpenApiDocument(registryInOrder(false));
    const appClient = createOpenApiDocument(registryInOrder(false), { audience: "app-client" });

    expect(Object.keys(complete.paths)).toEqual(["/assets/{name}", "/wallets/{walletId}"]);
    expect(Object.keys(appClient.paths)).toEqual(["/wallets/{walletId}"]);
    expect(objectAt(appClient.components, "schemas")).not.toHaveProperty("DownloadAssetOutput");
  });

  it("rejects component names that collide with the canonical error envelope", () => {
    const registry = createOpenApiRegistry({ title: "API", version: "1" });
    const collision = defineContract({
      ...createWallet,
      operationId: "Error",
      method: "post",
      path: "/errors",
      request: { body: z.object({ message: z.string() }) },
    });

    expect(() => registry.registerContract(collision)).toThrowError("OpenAPI schema collision: ErrorBody");
  });

  it("rejects an omitted auth posture even when untyped JavaScript calls the API", () => {
    expect(() => defineContract({ ...createWallet, auth: undefined as never })).toThrowError(
      "auth must explicitly be 'anonymous' or 'required'",
    );
  });

  it("rejects route and operation identity collisions during explicit registration", () => {
    const routeCollision = createOpenApiRegistry({ title: "API", version: "1" });
    routeCollision.registerContract(createWallet);
    expect(() => routeCollision.registerContract({ ...createWallet, operationId: "CreateWalletAgain" }))
      .toThrowError("HTTP contract collision: POST /wallets/{walletId}");

    const operationCollision = createOpenApiRegistry({ title: "API", version: "1" });
    operationCollision.registerContract(createWallet);
    expect(() => operationCollision.registerContract({ ...createWallet, method: "put", path: "/wallets" }))
      .toThrowError("OpenAPI operationId collision: CreateWallet");
  });

  it("rejects a params schema that drifts from the explicit OpenAPI path", () => {
    const registry = createOpenApiRegistry({ title: "API", version: "1" });
    registry.registerContract(defineContract({
      ...downloadAsset,
      operationId: "DownloadWrongAsset",
      request: { params: z.object({ assetId: z.string() }) },
    }));

    expect(() => createOpenApiDocument(registry)).toThrowError(
      "DownloadWrongAsset request.params must exactly match {parameters} in /assets/{name}",
    );
  });

  it("keeps the normalized operation and error envelope contract in a snapshot", () => {
    const document = createOpenApiDocument(registryInOrder(false));
    const schemas = objectAt(document.components, "schemas");

    expect({
      operation: objectAt(objectAt(document.paths, "/wallets/{walletId}"), "post"),
      ErrorBody: schemas.ErrorBody,
    }).toMatchSnapshot();
  });
});
