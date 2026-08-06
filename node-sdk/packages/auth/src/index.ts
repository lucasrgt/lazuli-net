import {
  Errors,
  Result,
  type Result as ResultOutcome,
  type SkiesError,
} from "@skiesjs/core";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;
const CLOCK_TOLERANCE_SECONDS = 30;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Supplies wall-clock time so issuing and verification can be deterministic in tests. */
export interface Clock {
  /** Return the current instant. */
  now(): Date;
}

/** The system clock used when an application does not supply another clock. */
export const SystemClock: Clock = Object.freeze({ now: () => new Date() });

/** The authenticated identity recovered from a verified access token. */
export interface CurrentUser {
  readonly isAuthenticated: true;
  readonly userId: string;
  readonly orgId: string;
  readonly role: string | null;
  readonly sessionId: string;
  readonly name: string | null;
}

/** Stable auth-boundary error codes that applications can register directly with OpenAPI. */
export const AuthErrorCodes = Object.freeze({
  invalidAccessToken: "auth.invalid_access_token",
});

/** Every untrusted-token failure deliberately collapses to this stable public error. */
export const InvalidAccessTokenError: SkiesError = Object.freeze(
  Errors.unauthorized(AuthErrorCodes.invalidAccessToken, "invalid access token"),
);

/** Issues and verifies the short-lived access-token format shared by Skies applications. */
export class AccessTokens {
  readonly #key: Uint8Array;

  /** Configure one token boundary from the same signing secret, issuer, audience, and clock. */
  public constructor(
    secret: string,
    private readonly issuer: string,
    private readonly audience: string,
    private readonly clock: Clock = SystemClock,
  ) {
    assertNonBlank(secret, "secret");
    assertNonBlank(issuer, "issuer");
    assertNonBlank(audience, "audience");
    if (typeof clock?.now !== "function") throw new TypeError("clock must supply now().");
    this.#key = new TextEncoder().encode(secret);
  }

  /**
   * Issue an HS256 token that expires exactly 15 minutes after the injected clock's current second.
   * Empty or whitespace-only role and name values are omitted rather than emitted as empty claims.
   */
  public async issue(
    userId: string,
    orgId: string,
    role: string | null | undefined,
    sessionId: string,
    name: string | null | undefined,
  ): Promise<string> {
    assertUuid(userId, "userId");
    assertUuid(orgId, "orgId");
    assertUuid(sessionId, "sessionId");
    const issuedAt = epochSeconds(validNow(this.clock));

    return new SignJWT({
      sub: userId,
      org: orgId,
      sid: sessionId,
      ...(isNonBlank(role) ? { role } : {}),
      ...(isNonBlank(name) ? { name } : {}),
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt(issuedAt)
      .setNotBefore(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TOKEN_LIFETIME_SECONDS)
      .sign(this.#key);
  }

  /**
   * Verify signature, HS256, issuer, audience, and lifetime with 30 seconds of clock tolerance.
   * Invalid or malformed untrusted input is returned as one canonical unauthorized result.
   */
  public async verify(token: string): Promise<ResultOutcome<CurrentUser>> {
    try {
      const { payload } = await jwtVerify(token, this.#key, {
        algorithms: ["HS256"],
        issuer: this.issuer,
        audience: this.audience,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        currentDate: validNow(this.clock),
      });
      return currentUser(payload);
    } catch {
      return unauthorized();
    }
  }
}

function currentUser(payload: JWTPayload): ResultOutcome<CurrentUser> {
  if (
    typeof payload.exp !== "number"
    || !isUuid(payload.sub)
    || !isUuid(payload.org)
    || !isUuid(payload.sid)
    || !isOptionalText(payload.role)
    || !isOptionalText(payload.name)
  ) {
    return unauthorized();
  }

  return Result.ok({
    isAuthenticated: true,
    userId: payload.sub,
    orgId: payload.org,
    role: nonBlankOrNull(payload.role),
    sessionId: payload.sid,
    name: nonBlankOrNull(payload.name),
  });
}

function unauthorized(): ResultOutcome<never> {
  return Result.fail(InvalidAccessTokenError);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && UUID_PATTERN.test(value)
    && value.toLowerCase() !== NIL_UUID;
}

function assertUuid(value: unknown, name: string): asserts value is string {
  if (!isUuid(value)) throw new TypeError(`${name} must be a non-nil UUID.`);
}

function isOptionalText(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isNonBlank(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonBlankOrNull(value: string | undefined): string | null {
  return isNonBlank(value) ? value : null;
}

function assertNonBlank(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a nonblank string.`);
  }
}

function validNow(clock: Clock): Date {
  const value = clock.now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("clock.now() must return a valid Date.");
  }
  return value;
}

function epochSeconds(value: Date): number {
  return Math.floor(value.getTime() / 1_000);
}
