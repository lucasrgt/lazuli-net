import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { RefreshCookie, type RefreshCookieOptions } from "./index.js";

const EXPIRES = new Date("2030-02-03T04:05:06.000Z");

function setApp(options: RefreshCookieOptions, existing = false): express.Express {
  const app = express();
  app.set("trust proxy", true);
  const refresh = new RefreshCookie(options);
  app.get("/set", (incoming, response) => {
    if (existing) response.append("Set-Cookie", "theme=dark; Path=/");
    refresh.setRefresh(incoming, response, "the-token", EXPIRES);
    response.status(204).send();
  });
  app.get("/clear", (_incoming, response) => {
    if (existing) response.append("Set-Cookie", "theme=dark; Path=/");
    refresh.clear(response);
    response.status(204).send();
  });
  return app;
}

function setCookies(response: request.Response): string[] {
  const values = response.headers["set-cookie"];
  if (!Array.isArray(values)) throw new Error("expected Set-Cookie headers");
  return values;
}

function hasAttribute(value: string, attribute: string): boolean {
  return value.split(";").some((part) => part.trim().toLowerCase() === attribute.toLowerCase());
}

describe("RefreshCookie", () => {
  it.each([
    ["missing name", { name: "" }],
    ["blank name", { name: "   " }],
    ["invalid name", { name: "bad;name" }],
    ["relative path", { name: "refresh", path: "account" }],
    ["blank path", { name: "refresh", path: " " }],
    ["blank domain", { name: "refresh", domain: " " }],
    ["invalid domain", { name: "refresh", domain: "bad domain" }],
    ["invalid sameSite", { name: "refresh", sameSite: "wide-open" }],
  ])("rejects %s during construction", (_label, options) => {
    expect(() => new RefreshCookie(options as RefreshCookieOptions)).toThrow(TypeError);
  });

  it.each([
    ["web", true],
    ["WEB", true],
    ["Web", true],
    ["mobile", false],
    ["", false],
  ])("recognizes X-Client %j with exact case-insensitive semantics", async (client, expected) => {
    const app = express();
    const refresh = new RefreshCookie({ name: "refresh" });
    app.get("/client", (incoming, response) => response.json({ web: refresh.isWeb(incoming) }));

    const response = await request(app).get("/client").set("X-Client", client);

    expect(response.body).toEqual({ web: expected });
  });

  it("does not normalize whitespace around the exact web marker", () => {
    const refresh = new RefreshCookie({ name: "refresh" });
    const requestWith = (value: string): express.Request => ({
      get: () => value,
    }) as unknown as express.Request;

    expect(refresh.isWeb(requestWith(" web"))).toBe(false);
    expect(refresh.isWeb(requestWith("web "))).toBe(false);
  });

  it("treats an absent X-Client header as non-web", async () => {
    const app = express();
    const refresh = new RefreshCookie({ name: "refresh" });
    app.get("/client", (incoming, response) => response.json({ web: refresh.isWeb(incoming) }));

    expect((await request(app).get("/client")).body).toEqual({ web: false });
  });

  it("always prefers a nonempty cookie over the body, independent of X-Client", async () => {
    const app = express();
    const refresh = new RefreshCookie({ name: "refresh" });
    app.use(express.text({ type: "*/*" }));
    app.post("/read", (incoming, response) => {
      response.json({ token: refresh.refreshFrom(incoming, incoming.body as string) });
    });

    for (const client of [undefined, "web", "mobile"]) {
      let call = request(app).post("/read").set("Cookie", "refresh=cookie-token").send("body-token");
      if (client !== undefined) call = call.set("X-Client", client);
      const response = await call;
      expect(response.body).toEqual({ token: "cookie-token" });
    }
  });

  it.each([
    ["absent cookie", undefined],
    ["empty named cookie", "refresh="],
    ["malformed cookie", "refresh"],
    ["unrelated cookie", "theme=dark"],
  ])("falls back to the body for an %s", async (_label, cookie) => {
    const app = express();
    const refresh = new RefreshCookie({ name: "refresh" });
    app.use(express.text({ type: "*/*" }));
    app.post("/read", (incoming, response) => {
      response.json({ token: refresh.refreshFrom(incoming, incoming.body as string) });
    });

    let call = request(app).post("/read").send("body-token");
    if (cookie !== undefined) call = call.set("Cookie", cookie);

    expect((await call).body).toEqual({ token: "body-token" });
  });

  it("returns an empty token when both cookie and body are absent", async () => {
    const app = express();
    const refresh = new RefreshCookie({ name: "refresh" });
    app.get("/read", (incoming, response) => {
      response.json({ token: refresh.refreshFrom(incoming, undefined) });
    });

    expect((await request(app).get("/read")).body).toEqual({ token: "" });
  });

  it("sets HttpOnly, Secure, strict SameSite, path, and expiration over HTTPS", async () => {
    const response = await request(setApp({ name: "refresh", path: "/account" }))
      .get("/set")
      .set("Host", "app.example.com")
      .set("X-Forwarded-Proto", "https");
    const cookie = setCookies(response)[0]!;

    expect(cookie).toContain("refresh=the-token");
    expect(cookie).toContain("Path=/account");
    expect(cookie).toContain("Expires=Sun, 03 Feb 2030 04:05:06 GMT");
    expect(cookie).toContain("SameSite=Strict");
    expect(hasAttribute(cookie, "HttpOnly")).toBe(true);
    expect(hasAttribute(cookie, "Secure")).toBe(true);
    expect(cookie.toLowerCase()).not.toContain("domain=");
  });

  it("keeps Secure on a non-loopback host even over plain HTTP", async () => {
    const response = await request(setApp({ name: "refresh" }))
      .get("/set")
      .set("Host", "app.example.com");

    expect(hasAttribute(setCookies(response)[0]!, "Secure")).toBe(true);
  });

  it.each(["localhost", "127.0.0.1", "127.42.1.9", "[::1]"])(
    "omits Secure only for plain HTTP loopback host %s",
    async (host) => {
      const response = await request(setApp({ name: "refresh" })).get("/set").set("Host", host);
      const cookie = setCookies(response)[0]!;

      expect(hasAttribute(cookie, "HttpOnly")).toBe(true);
      expect(hasAttribute(cookie, "Secure")).toBe(false);
    },
  );

  it("keeps Secure for loopback when the request is HTTPS", async () => {
    const response = await request(setApp({ name: "refresh" }))
      .get("/set")
      .set("Host", "localhost")
      .set("X-Forwarded-Proto", "https");

    expect(hasAttribute(setCookies(response)[0]!, "Secure")).toBe(true);
  });

  it("uses the configured domain, path, and SameSite without relaxing security attributes", async () => {
    const response = await request(setApp({
      name: "refresh",
      path: "/account",
      domain: ".example.com",
      sameSite: "lax",
    })).get("/set").set("Host", "app.example.com");
    const cookie = setCookies(response)[0]!;

    expect(cookie).toContain("Domain=.example.com");
    expect(cookie).toContain("Path=/account");
    expect(cookie).toContain("SameSite=Lax");
    expect(hasAttribute(cookie, "HttpOnly")).toBe(true);
    expect(hasAttribute(cookie, "Secure")).toBe(true);
  });

  it("clears under the same path and domain with immediate and past expiry", async () => {
    const response = await request(setApp({
      name: "refresh",
      path: "/account",
      domain: ".example.com",
      sameSite: "lax",
    })).get("/clear");
    const cookie = setCookies(response)[0]!;

    expect(cookie).toContain("refresh=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Domain=.example.com");
    expect(cookie).toContain("Path=/account");
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  });

  it.each(["/set", "/clear"])("preserves existing Set-Cookie headers when handling %s", async (path) => {
    const response = await request(setApp({ name: "refresh" }, true)).get(path);
    const values = setCookies(response);

    expect(values).toHaveLength(2);
    expect(values[0]).toBe("theme=dark; Path=/");
    expect(values[1]).toMatch(/^refresh=/u);
  });
});
