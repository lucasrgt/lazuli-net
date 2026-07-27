import { describe, expect, it, vi } from "vitest";
import { guardSession } from "./guard";
import type { SessionState } from "./session";

// guardSession is the symmetric guard primitive: one function, `allow` flipped, decides BOTH a private route and a
// public/guest one. The tests pin the symmetry (the same loading→wait) and the two failure directions — the
// anonymous-on-private bounce AND the signed-in-on-guest bounce (the pauta bug: a logged-in user reaching /login).
describe("guardSession", () => {
  const loading: SessionState<{ id: string }> = { status: "loading" };
  const authed: SessionState<{ id: string }> = { status: "authenticated", user: { id: "u1" } };
  const anon: SessionState<{ id: string }> = { status: "anonymous" };

  it("loading ⇒ wait for BOTH directions — never decide before the session settles", () => {
    expect(guardSession(loading, { allow: "authenticated", redirectTo: "/login" })).toEqual({ action: "wait" });
    expect(guardSession(loading, { allow: "anonymous", redirectTo: "/home" })).toEqual({ action: "wait" });
  });

  it("auth-guard: authenticated renders, anonymous redirects to the sign-in route", () => {
    expect(guardSession(authed, { allow: "authenticated", redirectTo: "/login" })).toEqual({ action: "render" });
    expect(guardSession(anon, { allow: "authenticated", redirectTo: "/login" })).toEqual({
      action: "redirect",
      to: "/login",
    });
  });

  it("guest-guard: anonymous renders, an already-signed-in user is bounced to home (the pauta bug)", () => {
    expect(guardSession(anon, { allow: "anonymous", redirectTo: "/home" })).toEqual({ action: "render" });
    expect(guardSession(authed, { allow: "anonymous", redirectTo: "/home" })).toEqual({
      action: "redirect",
      to: "/home",
    });
  });

  // Seed 5 — a capability/role gate is the SAME primitive carrying a predicate over the user (authz = data),
  // never a hand-rolled check each route re-derives.
  describe("capability gate (predicate)", () => {
    const isAdmin = (u: { id: string; role?: string }) => u.role === "admin";
    const admin: SessionState<{ id: string; role?: string }> = { status: "authenticated", user: { id: "a", role: "admin" } };
    const member: SessionState<{ id: string; role?: string }> = { status: "authenticated", user: { id: "m", role: "member" } };

    it("renders when the authenticated user satisfies the predicate", () => {
      expect(guardSession(admin, { allow: isAdmin, redirectTo: "/home" })).toEqual({ action: "render" });
    });

    it("redirects an authenticated user who lacks the capability", () => {
      expect(guardSession(member, { allow: isAdmin, redirectTo: "/home" })).toEqual({ action: "redirect", to: "/home" });
    });

    it("redirects an anonymous visitor — no user to inspect, the predicate is never called", () => {
      const spy = vi.fn(isAdmin);
      expect(guardSession({ status: "anonymous" }, { allow: spy, redirectTo: "/home" })).toEqual({
        action: "redirect",
        to: "/home",
      });
      expect(spy).not.toHaveBeenCalled();
    });

    it("still waits while loading (a capability gate never decides before the session settles)", () => {
      expect(guardSession({ status: "loading" }, { allow: isAdmin, redirectTo: "/home" })).toEqual({ action: "wait" });
    });
  });
});
