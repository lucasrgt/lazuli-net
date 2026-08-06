import request from "supertest";
import { describe, expect, it } from "vitest";
import { unit } from "@skiesjs/testing";
import { createOpenApiDocument } from "@skiesjs/openapi";
import { app, openApi } from "../../app.js";
import * as Ping from "./ping.slice.js";

// @skies-proof sample.health-responds
unit("Ping returns the health state without an HTTP host", async () => {
  const result = await Ping.handle({});

  expect(result.ok).toBe(true);
  if (result.ok) expect(result.value.status).toBe("ok");
});

describe("Ping", () => {
  it("publishes the stable operation while excluding internal routes from app clients", async () => {
    const response = await request(app).get("/openapi/v1.json");
    const client = createOpenApiDocument(openApi, { audience: "app-client" });

    expect(response.status).toBe(200);
    expect(response.body.paths["/health"].get.operationId).toBe("HealthPing");
    expect(client.paths).toEqual({});
  });

  it("maps the slice through the real Express boundary", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
