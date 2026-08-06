import { readFile } from "node:fs/promises";
import { decodeJwt, decodeProtectedHeader, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  AccessTokens,
  InvalidAccessTokenError,
  type Clock,
  type CurrentUser,
} from "./index.js";

const SECRET = "test-secret-for-jwt-signing-please-64-chars-long-enough-for-hs512";
const OTHER_SECRET = "other-secret-for-jwt-signing-please-64-chars-long-enough-hs512";
const ISSUER = "myapp";
const AUDIENCE = "myapp-api";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const NOW_SECONDS = Date.parse("2030-01-02T03:04:05.000Z") / 1_000;

class FakeClock implements Clock {
  public constructor(public current: Date) {}
  public now(): Date {
    return new Date(this.current);
  }
}

function clockAt(seconds: number): FakeClock {
  return new FakeClock(new Date(seconds * 1_000));
}

function tokens(clock: Clock = clockAt(NOW_SECONDS)): AccessTokens {
  return new AccessTokens(SECRET, ISSUER, AUDIENCE, clock);
}

interface MintOptions {
  readonly secret?: string;
  readonly issuer?: string;
  readonly audience?: string;
  readonly algorithm?: "HS256" | "HS512";
}

async function mint(
  claims: Record<string, unknown> = {},
  options: MintOptions = {},
): Promise<string> {
  const algorithm = options.algorithm ?? "HS256";
  return new SignJWT({
    sub: USER_ID,
    org: ORG_ID,
    sid: SESSION_ID,
    iat: NOW_SECONDS,
    nbf: NOW_SECONDS,
    exp: NOW_SECONDS + 900,
    ...claims,
  })
    .setProtectedHeader({ alg: algorithm, typ: "JWT" })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .sign(new TextEncoder().encode(options.secret ?? SECRET));
}

function expectUnauthorized(result: Awaited<ReturnType<AccessTokens["verify"]>>): void {
  expect(result).toEqual({ ok: false, error: InvalidAccessTokenError });
  if (!result.ok) expect(result.error).toBe(InvalidAccessTokenError);
}

function expectUser(result: Awaited<ReturnType<AccessTokens["verify"]>>): CurrentUser {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected verified current user");
  return result.value;
}

describe("AccessTokens", () => {
  it("round-trips the typed current user and uses the injected issue time", async () => {
    const clock = clockAt(NOW_SECONDS);
    const jwt = await tokens(clock).issue(USER_ID, ORG_ID, "admin", SESSION_ID, "Ada");

    expect(decodeProtectedHeader(jwt)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(decodeJwt(jwt)).toMatchObject({
      iss: ISSUER,
      aud: AUDIENCE,
      sub: USER_ID,
      org: ORG_ID,
      sid: SESSION_ID,
      role: "admin",
      name: "Ada",
      iat: NOW_SECONDS,
      nbf: NOW_SECONDS,
      exp: NOW_SECONDS + 15 * 60,
    });
    expect(expectUser(await tokens(clock).verify(jwt))).toEqual({
      isAuthenticated: true,
      userId: USER_ID,
      orgId: ORG_ID,
      role: "admin",
      sessionId: SESSION_ID,
      name: "Ada",
    });
  });

  it.each([
    ["issuer", { issuer: "another-app" }],
    ["audience", { audience: "another-api" }],
    ["signing key", { secret: OTHER_SECRET }],
  ] as const)("rejects the wrong %s with the stable unauthorized result", async (_label, options) => {
    expectUnauthorized(await tokens().verify(await mint({}, options)));
  });

  it("pins verification to HS256 even when HS512 uses the configured key", async () => {
    expectUnauthorized(await tokens().verify(await mint({}, { algorithm: "HS512" })));
  });

  it("rejects expired and not-yet-valid tokens outside the 30-second skew", async () => {
    expectUnauthorized(await tokens().verify(await mint({ exp: NOW_SECONDS - 31 })));
    expectUnauthorized(await tokens().verify(await mint({ nbf: NOW_SECONDS + 31 })));
  });

  it("accepts both lifetime claims just inside the skew", async () => {
    expectUser(await tokens().verify(await mint({ exp: NOW_SECONDS - 29 })));
    expectUser(await tokens().verify(await mint({ nbf: NOW_SECONDS + 29 })));
  });

  it("pins the exact skew boundaries used by jose", async () => {
    expectUnauthorized(await tokens().verify(await mint({ exp: NOW_SECONDS - 30 })));
    expectUser(await tokens().verify(await mint({ nbf: NOW_SECONDS + 30 })));
  });

  it("uses the injected verification time rather than the system clock", async () => {
    const clock = clockAt(NOW_SECONDS);
    const service = tokens(clock);
    const jwt = await service.issue(USER_ID, ORG_ID, null, SESSION_ID, null);

    clock.current = new Date((NOW_SECONDS + 15 * 60 + 29) * 1_000);
    expectUser(await service.verify(jwt));
    clock.current = new Date((NOW_SECONDS + 15 * 60 + 30) * 1_000);
    expectUnauthorized(await service.verify(jwt));
  });

  it("requires an expiration claim", async () => {
    expectUnauthorized(await tokens().verify(await mint({ exp: undefined })));
  });

  it.each(["sub", "org", "sid"])("rejects a missing %s UUID claim", async (claim) => {
    expectUnauthorized(await tokens().verify(await mint({ [claim]: undefined })));
  });

  it.each(["sub", "org", "sid"])("rejects an empty %s UUID claim", async (claim) => {
    expectUnauthorized(await tokens().verify(await mint({ [claim]: "" })));
  });

  it.each(["sub", "org", "sid"])("rejects a malformed %s UUID claim", async (claim) => {
    expectUnauthorized(await tokens().verify(await mint({ [claim]: "not-a-uuid" })));
  });

  it.each(["sub", "org", "sid"])("rejects a nil %s UUID claim", async (claim) => {
    expectUnauthorized(await tokens().verify(await mint({
      [claim]: "00000000-0000-0000-0000-000000000000",
    })));
  });

  it("omits absent and blank role and name claims", async () => {
    for (const [role, name] of [[null, undefined], ["", "   "]] as const) {
      const jwt = await tokens().issue(USER_ID, ORG_ID, role, SESSION_ID, name);
      const claims = decodeJwt(jwt);
      expect(Object.hasOwn(claims, "role")).toBe(false);
      expect(Object.hasOwn(claims, "name")).toBe(false);
      expect(expectUser(await tokens().verify(jwt))).toMatchObject({ role: null, name: null });
    }
  });

  it("maps externally signed blank optional claims to null but preserves present text", async () => {
    const blank = expectUser(await tokens().verify(await mint({ role: "", name: "   " })));
    expect(blank).toMatchObject({ role: null, name: null });

    const present = expectUser(await tokens().verify(await mint({ role: "admin", name: "Ada" })));
    expect(present).toMatchObject({ role: "admin", name: "Ada" });
  });

  it("rejects non-string optional claims instead of violating CurrentUser's type", async () => {
    expectUnauthorized(await tokens().verify(await mint({ role: 42 })));
    expectUnauthorized(await tokens().verify(await mint({ name: ["Ada"] })));
  });

  it("verifies the committed .NET-issued HS256 wire fixture", async () => {
    const fixture = JSON.parse(await readFile(
      new URL("../../../../tests/fixtures/jwt-interop.json", import.meta.url),
      "utf8",
    )) as {
      readonly secret: string;
      readonly issuer: string;
      readonly audience: string;
      readonly verificationTime: string;
      readonly dotnetToken: string;
      readonly userId: string;
      readonly orgId: string;
      readonly sessionId: string;
      readonly role: string;
      readonly name: string;
    };
    const verifier = new AccessTokens(fixture.secret, fixture.issuer, fixture.audience, {
      now: () => new Date(fixture.verificationTime),
    });

    expect(expectUser(await verifier.verify(fixture.dotnetToken))).toEqual({
      isAuthenticated: true,
      userId: fixture.userId,
      orgId: fixture.orgId,
      sessionId: fixture.sessionId,
      role: fixture.role,
      name: fixture.name,
    });
  });

  it.each([
    ["userId", "not-a-uuid", ORG_ID, SESSION_ID],
    ["orgId", USER_ID, "", SESSION_ID],
    ["sessionId", USER_ID, ORG_ID, "00000000-0000-0000-0000-000000000000"],
  ])("refuses to issue an invalid %s", async (_label, userId, orgId, sessionId) => {
    await expect(tokens().issue(userId, orgId, null, sessionId, null)).rejects.toThrow(TypeError);
  });
});
