import express from "express";
import request from "supertest";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { Errors, Result, scalarCodec } from "@skiesjs/core";
import {
  createOpenApiRegistry,
  defineContract,
  defineErrorCodes,
  scalarSchema,
} from "@skiesjs/openapi";
import { mapSlice, serveOpenApi } from "./index.js";

const authorize: express.RequestHandler = (_request, _response, next) => next();

const contract = defineContract({
  operationId: "UpdateWallet",
  method: "put",
  path: "/wallets/{walletId}",
  auth: "required",
  kind: "app",
  request: {
    body: z.object({ amount: z.number().int().positive() }),
    query: z.object({ notify: z.stringbool().optional() }),
    params: z.object({ walletId: z.string().uuid() }),
    headers: z.object({ "x-request-id": z.string().min(1) }),
  },
  success: {
    status: 202,
    output: z.object({ id: z.string(), amount: z.number(), notified: z.boolean() }),
  },
});

interface Cents { readonly value: number }
const centsSchema = scalarSchema(scalarCodec<Cents, number>({
  primitive: { type: "integer", format: "int64" },
  encode: (value) => value.value,
  decode: (value) => value >= 0
    ? Result.ok({ value })
    : Result.fail(Errors.validation("money.cents.negative", "cents cannot be negative")),
}));
const scalarContract = defineContract({
  operationId: "EchoAmount",
  method: "post",
  path: "/amounts",
  auth: "anonymous",
  kind: "app",
  request: { body: z.object({ amount: centsSchema }) },
  success: { status: 200, output: z.object({ amount: centsSchema }) },
});

describe("mapSlice", () => {
  it("validates four request sources and visibly maps parsed values to the handler input", async () => {
    const app = express();
    const router = express.Router();
    const registry = createOpenApiRegistry({ title: "Wallet API", version: "1" });
    app.use(express.json());
    mapSlice(router, registry, contract, {
      authorize,
      toInput: ({ body, query, params, headers }) => ({
        id: params.walletId,
        amount: body.amount,
        notify: query.notify ?? false,
        requestId: headers["x-request-id"],
      }),
      handle: ({ id, amount, notify }) => Result.ok({ id, amount, notified: notify }),
    });
    app.use(router);

    const response = await request(app)
      .put("/wallets/77c5f75a-bb2a-4a48-8c8d-60abfd4c866d?notify=true")
      .set("x-request-id", "request-1")
      .send({ amount: 25 });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      id: "77c5f75a-bb2a-4a48-8c8d-60abfd4c866d",
      amount: 25,
      notified: true,
    });
    expect(registry.contracts()).toEqual([contract]);
  });

  it("exposes authenticated response locals only at the explicit mapping boundary", async () => {
    const app = express();
    const router = express.Router();
    const registry = createOpenApiRegistry({ title: "Wallet API", version: "1" });
    const withIdentity: express.RequestHandler = (_request, response, next) => {
      response.locals.currentUser = { orgId: "org-1" };
      next();
    };
    mapSlice(router, registry, contract, {
      authorize: withIdentity,
      toInput: ({ body, params }) => ({ id: params.walletId, amount: body.amount }),
      handle: ({ id, amount }, { response }) => Result.ok({
        id,
        amount,
        notified: response.locals.currentUser.orgId === "org-1",
      }),
    });
    app.use(express.json(), router);

    const response = await request(app)
      .put("/wallets/77c5f75a-bb2a-4a48-8c8d-60abfd4c866d")
      .set("x-request-id", "request-1")
      .send({ amount: 25 });

    expect(response.status).toBe(202);
    expect(response.body.notified).toBe(true);
  });

  it("accumulates Zod issues into the stable canonical validation envelope", async () => {
    const app = express();
    const router = express.Router();
    const registry = createOpenApiRegistry({ title: "Wallet API", version: "1" });
    app.use(express.json());
    mapSlice(router, registry, contract, {
      authorize,
      toInput: ({ body, params }) => ({ id: params.walletId, amount: body.amount }),
      handle: ({ id, amount }) => Result.ok({ id, amount, notified: false }),
    });
    app.use(router);

    const response = await request(app)
      .put("/wallets/not-a-uuid?notify=not-a-boolean")
      .send({ amount: "twenty-five" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Validation",
      code: "validation.failed",
      message: "Validation failed",
    });
    expect(response.body.fields).toEqual([
      expect.objectContaining({ field: "body.amount", code: "validation.invalid_type" }),
      expect.objectContaining({ field: "headers.x-request-id", code: "validation.invalid_type" }),
      expect.objectContaining({ field: "params.walletId", code: "validation.invalid_format" }),
      expect.objectContaining({ field: "query.notify", code: "validation.invalid_value" }),
    ]);
  });

  it("decodes scalar inputs and encodes handler domain outputs", async () => {
    const app = express();
    const router = express.Router();
    const registry = createOpenApiRegistry({ title: "Money API", version: "1" });
    app.use(express.json());
    mapSlice(router, registry, scalarContract, {
      toInput: ({ body }) => body,
      handle: ({ amount }) => Result.ok({ amount: { value: amount.value + 1 } }),
    });
    app.use(router);

    const valid = await request(app).post("/amounts").send({ amount: 41 });
    expect(valid.status).toBe(200);
    expect(valid.body).toEqual({ amount: 42 });

    const invalid = await request(app).post("/amounts").send({ amount: -1 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.fields).toEqual([
      expect.objectContaining({ field: "body.amount", code: "money.cents.negative" }),
    ]);
  });

  it("refuses to register a required-auth contract without real middleware", () => {
    const router = express.Router();
    const registry = createOpenApiRegistry({ title: "Wallet API", version: "1" });

    expect(() => mapSlice(router, registry, contract, {
      toInput: ({ body, params }) => ({ id: params.walletId, amount: body.amount }),
      handle: ({ id, amount }) => Result.ok({ id, amount, notified: false }),
    })).toThrow("UpdateWallet requires explicit authorize middleware");
    expect(registry.contracts()).toEqual([]);
  });

  it("forwards unexpected mapper exceptions through normal Express error middleware", async () => {
    const app = express();
    const router = express.Router();
    const registry = createOpenApiRegistry({ title: "Wallet API", version: "1" });
    app.use(express.json());
    mapSlice(router, registry, contract, {
      authorize,
      toInput: () => {
        throw new Error("mapping failed");
      },
      handle: () => Result.ok({ id: "unused", amount: 0, notified: false }),
    });
    app.use(router);
    app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.status(500).json({ handled: true });
    });

    const response = await request(app)
      .put("/wallets/77c5f75a-bb2a-4a48-8c8d-60abfd4c866d")
      .set("x-request-id", "request-1")
      .send({ amount: 25 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ handled: true });
  });
});

describe("serveOpenApi", () => {
  it("serves current registry metadata and supports the app-client projection", async () => {
    const app = express();
    const router = express.Router();
    const registry = createOpenApiRegistry({ title: "Wallet API", version: "1" });
    mapSlice(router, registry, contract, {
      authorize,
      toInput: ({ body, params }) => ({ id: params.walletId, amount: body.amount }),
      handle: ({ id, amount }) => Result.ok({ id, amount, notified: false }),
    });
    registry.registerErrorCodes(defineErrorCodes({ invalidAmount: "wallet.amount.invalid" }));
    router.get("/openapi/v1.json", serveOpenApi(registry, { audience: "app-client" }));
    app.use(router);

    const response = await request(app).get("/openapi/v1.json");

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.paths["/wallets/{walletId}"].put.operationId).toBe("UpdateWallet");
    expect(response.body.components.schemas.ErrorBody.properties.code.enum).toEqual(["wallet.amount.invalid"]);
  });
});
