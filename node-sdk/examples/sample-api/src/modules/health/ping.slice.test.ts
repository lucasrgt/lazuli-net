import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../app.js";
import * as Ping from "./ping.slice.js";

describe("Ping", () => {
  it("returns the health state without an HTTP host", async () => {
    const result = await Ping.handle({});

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("ok");
  });

  it("maps the slice through the real Express boundary", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
