import { isIP } from "node:net";
import type { Request, Response } from "express";
import { parse, serialize } from "cookie";

/** SameSite policies supported by the refresh-cookie boundary. */
export type RefreshCookieSameSite = "strict" | "lax" | "none";

/** Application-specific scope for the framework-owned secure refresh cookie. */
export interface RefreshCookieOptions {
  /** Cookie name. It must be nonblank and valid on a Set-Cookie header. */
  readonly name: string;
  /** Absolute cookie path, defaulting to `/`. */
  readonly path?: string;
  /** Optional shared domain; omitted or null keeps the cookie host-only. */
  readonly domain?: string | null;
  /** SameSite policy, defaulting to `strict`. */
  readonly sameSite?: RefreshCookieSameSite;
}

/**
 * Moves refresh tokens between an httpOnly cookie for web clients and an explicit body value for other clients.
 * HttpOnly and production-grade Secure behavior are framework-owned rather than caller-configurable.
 */
export class RefreshCookie {
  readonly #name: string;
  readonly #path: string;
  readonly #domain: string | undefined;
  readonly #sameSite: RefreshCookieSameSite;

  /** Validate and snapshot one application's cookie name, scope, and SameSite policy. */
  public constructor(options: RefreshCookieOptions) {
    if (options === null || typeof options !== "object") {
      throw new TypeError("refresh cookie options are required");
    }
    assertNonBlank(options.name, "name");
    const path = options.path ?? "/";
    if (typeof path !== "string" || !path.startsWith("/")) {
      throw new TypeError("path must be an absolute cookie path");
    }
    const domain = normalizedDomain(options.domain);
    const sameSite = normalizedSameSite(options.sameSite);

    validateCookieOptions(options.name, path, domain, sameSite);
    this.#name = options.name;
    this.#path = path;
    this.#domain = domain;
    this.#sameSite = sameSite;
  }

  /** True only for the case-insensitive exact `X-Client: web` convention. */
  public isWeb(request: Request): boolean {
    const client = request.get("X-Client");
    return client !== undefined && client.toLowerCase() === "web";
  }

  /**
   * Prefer any nonempty named cookie, then the supplied body token, regardless of the client header.
   * Malformed cookie syntax is treated as absent rather than escaping the HTTP boundary.
   */
  public refreshFrom(request: Request, fromBody: string | null | undefined): string {
    const header = request.headers.cookie;
    if (typeof header === "string") {
      try {
        const fromCookie = parse(header)[this.#name];
        if (fromCookie !== undefined && fromCookie.length > 0) return fromCookie;
      } catch {
        // A malformed Cookie header is untrusted input and has the same meaning as an absent cookie.
      }
    }
    return fromBody ?? "";
  }

  /** Plant an expiring httpOnly refresh cookie, retaining Secure outside plain-HTTP loopback development. */
  public setRefresh(request: Request, response: Response, token: string, expires: Date): void {
    appendSetCookie(response, serialize(this.#name, token, {
      httpOnly: true,
      secure: shouldSecure(request),
      sameSite: this.#sameSite,
      expires,
      path: this.#path,
      ...this.#domain === undefined ? {} : { domain: this.#domain },
    }));
  }

  /** Expire the cookie under the exact path and domain used when it was planted. */
  public clear(response: Response): void {
    appendSetCookie(response, serialize(this.#name, "", {
      expires: new Date(0),
      maxAge: 0,
      path: this.#path,
      ...this.#domain === undefined ? {} : { domain: this.#domain },
    }));
  }
}

function assertNonBlank(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a nonblank string`);
  }
}

function normalizedDomain(domain: string | null | undefined): string | undefined {
  if (domain === undefined || domain === null) return undefined;
  assertNonBlank(domain, "domain");
  return domain;
}

function normalizedSameSite(value: RefreshCookieSameSite | undefined): RefreshCookieSameSite {
  if (value === undefined) return "strict";
  if (value === "strict" || value === "lax" || value === "none") return value;
  throw new TypeError("sameSite must be strict, lax, or none");
}

function validateCookieOptions(
  name: string,
  path: string,
  domain: string | undefined,
  sameSite: RefreshCookieSameSite,
): void {
  serialize(name, "validation", {
    path,
    sameSite,
    ...domain === undefined ? {} : { domain },
  });
}

function shouldSecure(request: Request): boolean {
  if (request.secure || request.protocol.toLowerCase() === "https") return true;
  const hostname = unbracketed(request.hostname).toLowerCase();
  if (hostname === "localhost" || hostname === "::1") return false;
  return isIP(hostname) !== 4 || !hostname.startsWith("127.");
}

function unbracketed(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function appendSetCookie(response: Response, value: string): void {
  response.append("Set-Cookie", value);
}
