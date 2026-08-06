import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Options, Store } from "express-rate-limit";
import { createRateLimiter } from "./index.js";

interface Counter {
  totalHits: number;
  resetTime: Date;
}

class DeterministicStore implements Store {
  private readonly counters = new Map<string, Counter>();
  private windowMs = 0;

  public constructor(private readonly now: () => number) {}

  public init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  public increment(key: string): { totalHits: number; resetTime: Date } {
    let counter = this.counters.get(key);
    if (counter === undefined || counter.resetTime.getTime() <= this.now()) {
      counter = { totalHits: 0, resetTime: new Date(this.now() + this.windowMs) };
      this.counters.set(key, counter);
    }
    counter.totalHits += 1;
    return { totalHits: counter.totalHits, resetTime: new Date(counter.resetTime) };
  }

  public decrement(key: string): void {
    const counter = this.counters.get(key);
    if (counter !== undefined && counter.totalHits > 0) counter.totalHits -= 1;
  }

  public resetKey(key: string): void {
    this.counters.delete(key);
  }

  public resetAll(): void {
    this.counters.clear();
  }
}

function appWithStore(
  store: Store,
  options: { readonly limit?: number; readonly code?: string; readonly message?: string } = {},
): express.Express {
  const app = express();
  app.use(createRateLimiter({
    windowMs: 30_000,
    limit: options.limit ?? 2,
    ...(options.code === undefined ? {} : { code: options.code }),
    ...(options.message === undefined ? {} : { message: options.message }),
    store,
    keyGenerator: (incoming) => incoming.get("x-client-id") ?? "anonymous",
  }));
  app.get("/resource", (_incoming, response) => response.json({ allowed: true }));
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createRateLimiter", () => {
  it("allows the first N requests then returns the configured canonical error and headers", async () => {
    let now = Date.parse("2030-01-02T03:04:05.000Z");
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const app = appWithStore(new DeterministicStore(() => now), {
      code: "catalog.read_rate_limited",
      message: "Read quota exceeded.",
    });

    const first = await request(app).get("/resource").set("x-client-id", "client-a");
    const second = await request(app).get("/resource").set("x-client-id", "client-a");
    const rejected = await request(app).get("/resource").set("x-client-id", "client-a");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(rejected.status).toBe(429);
    expect(rejected.body).toEqual({
      error: "RateLimit",
      code: "catalog.read_rate_limited",
      message: "Read quota exceeded.",
      fields: null,
    });
    expect(rejected.headers["retry-after"]).toBe("30");
    expect(rejected.headers["retry-after"]).toMatch(/^\d+$/);
    expect(rejected.headers.ratelimit).toBe('"2-in-30sec"; r=0; t=30');
    expect(rejected.headers["ratelimit-policy"]).toMatch(
      /^"2-in-30sec"; q=2; w=30; pk=:[A-Za-z0-9+/]{16}:$/,
    );
    expect(rejected.headers["x-ratelimit-limit"]).toBeUndefined();
    expect(JSON.stringify(rejected.headers)).not.toContain("client-a");
    expect(JSON.stringify(rejected.body)).not.toContain("totalHits");
  });

  it("starts a fresh quota after the store's deterministic reset time", async () => {
    let now = Date.parse("2030-01-02T03:04:05.000Z");
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const app = appWithStore(new DeterministicStore(() => now), { limit: 1 });

    expect((await request(app).get("/resource").set("x-client-id", "client-a")).status).toBe(200);
    expect((await request(app).get("/resource").set("x-client-id", "client-a")).status).toBe(429);
    now += 30_000;
    const afterReset = await request(app).get("/resource").set("x-client-id", "client-a");

    expect(afterReset.status).toBe(200);
    expect(afterReset.headers.ratelimit).toContain("r=0");
  });

  it("keeps independently keyed clients in separate quotas", async () => {
    const now = Date.parse("2030-01-02T03:04:05.000Z");
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const app = appWithStore(new DeterministicStore(() => now), { limit: 1 });

    const firstClient = await request(app).get("/resource").set("x-client-id", "client-a");
    const secondClient = await request(app).get("/resource").set("x-client-id", "client-b");
    const firstClientAgain = await request(app).get("/resource").set("x-client-id", "client-a");

    expect(firstClient.status).toBe(200);
    expect(secondClient.status).toBe(200);
    expect(firstClientAgain.status).toBe(429);
  });

  it("uses IP partitioning without requiring hidden authentication state", async () => {
    const app = express();
    app.use(createRateLimiter({ windowMs: 30_000, limit: 1 }));
    app.get("/resource", (_incoming, response) => response.json({ allowed: true }));

    const allowed = await request(app).get("/resource");
    const rejected = await request(app).get("/resource");

    expect(allowed.status).toBe(200);
    expect(rejected.status).toBe(429);
    expect(rejected.body).toMatchObject({
      error: "RateLimit",
      code: "platform.rate_limited",
      message: "Too many requests. Please slow down.",
    });
  });

  it("forwards downstream failures through the normal Express 5 error pipeline", async () => {
    const failure = new Error("route unavailable");
    const now = Date.parse("2030-01-02T03:04:05.000Z");
    const app = express();
    app.use(createRateLimiter({
      windowMs: 30_000,
      limit: 2,
      store: new DeterministicStore(() => now),
      keyGenerator: () => "client-a",
    }));
    app.get("/resource", async () => {
      throw failure;
    });
    app.use((caught: unknown, _incoming: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.status(503).json({ handled: caught === failure });
    });

    const failed = await request(app).get("/resource");

    expect(failed.status).toBe(503);
    expect(failed.body).toEqual({ handled: true });
  });

  it("fails closed and forwards unexpected counter-store errors", async () => {
    const failure = new Error("counter unavailable");
    const store: Store = {
      increment: () => { throw failure; },
      decrement: () => undefined,
      resetKey: () => undefined,
    };
    let reachedRoute = false;
    const app = express();
    app.use(createRateLimiter({ windowMs: 30_000, limit: 2, store, keyGenerator: () => "client-a" }));
    app.get("/resource", (_incoming, response) => {
      reachedRoute = true;
      response.json({ allowed: true });
    });
    app.use((caught: unknown, _incoming: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.status(503).json({ handled: caught === failure });
    });

    const failed = await request(app).get("/resource");

    expect(failed.status).toBe(503);
    expect(failed.body).toEqual({ handled: true });
    expect(reachedRoute).toBe(false);
  });

  it.each([
    [{ windowMs: 0, limit: 1 }, "windowMs"],
    [{ windowMs: -1, limit: 1 }, "windowMs"],
    [{ windowMs: 1.5, limit: 1 }, "windowMs"],
    [{ windowMs: Number.NaN, limit: 1 }, "windowMs"],
    [{ windowMs: 1_000, limit: 0 }, "limit"],
    [{ windowMs: 1_000, limit: -1 }, "limit"],
    [{ windowMs: 1_000, limit: 1.5 }, "limit"],
  ])("rejects invalid numeric policy %# before constructing middleware", (options, field) => {
    expect(() => createRateLimiter(options)).toThrow(`${field} must be a positive integer`);
  });

  it("rejects a blank error code before constructing middleware", () => {
    expect(() => createRateLimiter({ windowMs: 1_000, limit: 1, code: "   " })).toThrow(
      "code must be a non-blank string",
    );
  });
});
