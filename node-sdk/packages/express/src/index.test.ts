import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { Errors, Result } from "@skiesjs/core";
import { endpoint } from "./index.js";

describe("endpoint", () => {
  it("maps a successful result to JSON", async () => {
    const app = express();
    app.get("/wallet", endpoint(() => Result.ok({ balance: 42 })));

    const response = await request(app).get("/wallet");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ balance: 42 });
  });

  it("allows the explicit boundary to choose a creation status", async () => {
    const app = express();
    app.post("/wallet", endpoint(() => Result.ok({ id: "wallet-1" }), { successStatus: 201 }));

    const response = await request(app).post("/wallet");

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: "wallet-1" });
  });

  it("maps every expected failure through the stable error envelope", async () => {
    const app = express();
    app.get(
      "/wallet",
      endpoint(() => Result.fail(Errors.notFound("wallets.not_found", "wallet not found"))),
    );

    const response = await request(app).get("/wallet");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "NotFound",
      code: "wallets.not_found",
      message: "wallet not found",
      fields: null,
    });
  });

  it("leaves unexpected exceptions to the application's Express error middleware", async () => {
    const app = express();
    app.get(
      "/wallet",
      endpoint(() => {
        throw new Error("database unavailable");
      }),
    );
    app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.status(500).json({ handled: true });
    });

    const response = await request(app).get("/wallet");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ handled: true });
  });
});
