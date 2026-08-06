import type { RequestHandler } from "express";
import {
  rateLimit,
  type Store,
  type ValueDeterminingMiddleware,
} from "express-rate-limit";
import { Errors, Result } from "@skiesjs/core";
import { toHttp } from "@skiesjs/express";

const DEFAULT_CODE = "platform.rate_limited";
const DEFAULT_MESSAGE = "Too many requests. Please slow down.";

/** Explicit policy for one Express rate-limiter middleware instance. */
export interface RateLimiterOptions {
  /** Fixed-window duration in milliseconds. Must be a positive integer. */
  readonly windowMs: number;
  /** Requests allowed for each client during one window. Must be a positive integer. */
  readonly limit: number;
  /** Stable client-facing error code. Defaults to `platform.rate_limited`. */
  readonly code?: string;
  /** Stable developer-facing error message. Defaults to `Too many requests. Please slow down.` */
  readonly message?: string;
  /** Shared or distributed counter supplied by the application. The in-memory store is the default. */
  readonly store?: Store;
  /** Explicit client key strategy. The safe `express-rate-limit` IP strategy is the default. */
  readonly keyGenerator?: ValueDeterminingMiddleware<string>;
}

function requirePositiveInteger(value: number, name: "windowMs" | "limit"): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

function requireCode(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("code must be a non-blank string");
  }
}

/**
 * Create one independently configured Express 5 rate limiter.
 *
 * Rejections use the canonical Skies `RateLimit` error envelope. Store failures are never bypassed: they are
 * forwarded to the application's Express error middleware, so a counter outage cannot silently disable the policy.
 */
export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  requirePositiveInteger(options.windowMs, "windowMs");
  requirePositiveInteger(options.limit, "limit");
  const code = options.code === undefined ? DEFAULT_CODE : options.code;
  requireCode(code);
  const message = options.message ?? DEFAULT_MESSAGE;

  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    legacyHeaders: false,
    standardHeaders: "draft-8",
    passOnStoreError: false,
    ...(options.store === undefined ? {} : { store: options.store }),
    ...(options.keyGenerator === undefined ? {} : { keyGenerator: options.keyGenerator }),
    handler: (_request, response) => {
      toHttp(Result.fail(Errors.rateLimit(code, message)), response);
    },
  });
}

export type { Store } from "express-rate-limit";
