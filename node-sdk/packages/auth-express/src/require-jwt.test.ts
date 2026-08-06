import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AccessTokens, type Clock } from "@skiesjs/auth";
import { currentUser, requireJwt } from "./index.js";

const SECRET = "test-secret-for-jwt-signing-please-64-chars-long-enough-for-hs256";
const ISSUER = "myapp";
const AUDIENCE = "myapp-api";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2030-01-02T03:04:05.000Z");

class FakeClock implements Clock {
  public constructor(public value: Date = NOW) {}
  public now(): Date {
    return new Date(this.value);
  }
}

function tokens(clock: Clock = new FakeClock()): AccessTokens {
  return new AccessTokens(SECRET, ISSUER, AUDIENCE, clock);
}

function protectedApp(accessTokens: AccessTokens, downstream?: () => void): express.Express {
  const app = express();
  app.get("/me", requireJwt(accessTokens), (_request, response) => {
    downstream?.();
    const user = currentUser(response);
    response.json({ user, sameLocal: response.locals.currentUser === user });
  });
  return app;
}

function expectCanonicalUnauthorized(response: request.Response): void {
  expect(response.status).toBe(401);
  expect(response.headers["www-authenticate"]).toBe("Bearer");
  expect(response.body).toEqual({
    error: "Unauthorized",
    code: "auth.invalid_access_token",
    message: "invalid access token",
    fields: null,
  });
}

describe("requireJwt", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["missing token", "Bearer"],
    ["empty token", "Bearer "],
    ["extra spacing", "Bearer  token"],
    ["extra material", "Bearer token extra"],
    ["basic scheme", "Basic token"],
    ["digest scheme", "Digest token"],
  ])("returns the canonical 401 for a %s Authorization header", async (_label, authorization) => {
    let call = request(protectedApp(tokens())).get("/me");
    if (authorization !== undefined) call = call.set("Authorization", authorization);

    expectCanonicalUnauthorized(await call);
  });

  it("accepts a case-insensitive Bearer scheme and exposes the typed current user", async () => {
    const accessTokens = tokens();
    const jwt = await accessTokens.issue(USER_ID, ORG_ID, "admin", SESSION_ID, "Ada");

    const response = await request(protectedApp(accessTokens))
      .get("/me")
      .set("Authorization", `bEaReR ${jwt}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        isAuthenticated: true,
        userId: USER_ID,
        orgId: ORG_ID,
        role: "admin",
        sessionId: SESSION_ID,
        name: "Ada",
      },
      sameLocal: true,
    });
  });

  it("collapses an invalid token to the canonical unauthorized boundary", async () => {
    const response = await request(protectedApp(tokens()))
      .get("/me")
      .set("Authorization", "Bearer not-a-jwt");

    expectCanonicalUnauthorized(response);
  });

  it("rejects a token expired outside the access-token clock tolerance", async () => {
    const clock = new FakeClock();
    const accessTokens = tokens(clock);
    const jwt = await accessTokens.issue(USER_ID, ORG_ID, null, SESSION_ID, null);
    clock.value = new Date(NOW.getTime() + 16 * 60 * 1_000);

    const response = await request(protectedApp(accessTokens))
      .get("/me")
      .set("Authorization", `Bearer ${jwt}`);

    expectCanonicalUnauthorized(response);
  });

  it("never invokes downstream handlers after authentication fails", async () => {
    let downstreamCalls = 0;

    const response = await request(protectedApp(tokens(), () => downstreamCalls += 1))
      .get("/me")
      .set("Authorization", "Bearer invalid");

    expectCanonicalUnauthorized(response);
    expect(downstreamCalls).toBe(0);
  });

  it("makes middleware ordering failures explicit through the currentUser accessor", async () => {
    const app = express();
    app.get("/me", (_request, response) => response.json(currentUser(response)));
    app.use((error: unknown, _request: express.Request, response: express.Response,
      _next: express.NextFunction) => {
      response.status(500).json({ message: error instanceof Error ? error.message : "unknown" });
    });

    const response = await request(app).get("/me");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: "requireJwt middleware must run before currentUser",
    });
  });
});
