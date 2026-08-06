import type { AuthAugment } from "./templates-auth-augment.js";

export function authProofSource(mode: AuthAugment, criterion: string): string {
  if (mode === "otp") return `import { Result } from "@skiesjs/core";
import { expect } from "vitest";
import { unit } from "@skiesjs/testing";
import { OtpErrorCodes } from "./auth-otp.errors.js";
import { createOtpFlow, type OtpState, type OtpStore } from "./auth-otp.js";

const initial = new Date("2030-01-01T00:00:00.000Z");
function fixture() {
  let current = initial;
  const states = new Map<string, OtpState>();
  let delivered = "";
  const store: OtpStore = {
    save: async (state) => { states.set(state.challengeId, state); },
    consume: async ({ challengeId, codeDigest, now }) => {
      const state = states.get(challengeId);
      if (state === undefined || state.codeDigest !== codeDigest) return "invalid";
      if (state.consumedAt !== null) return "replayed";
      if (state.expiresAt.getTime() <= now.getTime()) return "expired";
      states.set(challengeId, { ...state, consumedAt: now });
      return "accepted";
    },
  };
  const flow = createOtpFlow({
    store, pepper: "proof-only-otp-pepper", now: () => current, lifetimeMs: 1_000,
    delivery: { send: async ({ code }) => { delivered = code; } },
  });
  return { flow, states, code: () => delivered, expire: () => { current = new Date(initial.getTime() + 2_000); } };
}

// @skies-proof ${criterion}
unit("happy: stores only a digest and consumes one valid OTP", async () => {
    const test = fixture();
    const issued = await test.flow.issue("person@example.test");
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const state = test.states.get(issued.value.challengeId);
    expect(state).toBeDefined();
    expect(state).not.toHaveProperty("code");
    await expect(test.flow.verify(issued.value.challengeId, test.code())).resolves.toEqual(
      Result.ok({ verified: true }),
    );
  },
);

unit("sad: fails closed after expiry and on replay", async () => {
    const replay = fixture();
    const first = await replay.flow.issue("person@example.test");
    if (!first.ok) return;
    await replay.flow.verify(first.value.challengeId, replay.code());
    const repeated = await replay.flow.verify(first.value.challengeId, replay.code());
    expect(repeated).toMatchObject({ ok: false, error: { code: OtpErrorCodes.replayed } });

    const expired = fixture();
    const second = await expired.flow.issue("person@example.test");
    if (!second.ok) return;
    expired.expire();
    const late = await expired.flow.verify(second.value.challengeId, expired.code());
    expect(late).toMatchObject({ ok: false, error: { code: OtpErrorCodes.expired } });
  },
);
`;
  if (mode === "oauth") return `import { Errors, Result } from "@skiesjs/core";
import { expect } from "vitest";
import { unit } from "@skiesjs/testing";
import { OAuthErrorCodes } from "./auth-oauth.errors.js";
import { createOAuthFlow, type OAuthState, type OAuthStateProtector, type OAuthStateStore } from "./auth-oauth.js";

const initial = new Date("2030-01-01T00:00:00.000Z");
function fixture() {
  let current = initial;
  let state: OAuthState | undefined;
  const payloads = new Map<string, { readonly verifier: string; readonly expiresAt: string }>();
  const protector: OAuthStateProtector = {
    seal: async (payload) => { const token = \`proof-state-\${payloads.size + 1}\`; payloads.set(token, payload); return token; },
    open: async (token) => {
      const payload = payloads.get(token);
      return payload === undefined
        ? Result.fail(Errors.unauthorized(OAuthErrorCodes.invalidState, "invalid state"))
        : Result.ok(payload);
    },
  };
  const states: OAuthStateStore = {
    save: async (value) => { state = value; },
    consume: async ({ stateDigest, now }) => {
      if (state === undefined || state.stateDigest !== stateDigest) return "invalid";
      if (state.consumedAt !== null) return "replayed";
      if (state.expiresAt.getTime() <= now.getTime()) return "expired";
      state = { ...state, consumedAt: now };
      return "accepted";
    },
  };
  let exchanged = "";
  const flow = createOAuthFlow({
    states, protector, now: () => current, lifetimeMs: 1_000,
    provider: {
      authorizationUrl: ({ state: token }) => \`https://identity.example.test/authorize?state=\${token}\`,
      exchange: async ({ code }) => { exchanged = code; return Result.ok({ subject: "user-1" }); },
    },
  });
  return {
    flow, state: () => state, exchanged: () => exchanged,
    expire: () => { current = new Date(initial.getTime() + 2_000); },
  };
}

// @skies-proof ${criterion}
unit("happy: uses PKCE and consumes a digest-backed sealed state exactly once", async () => {
    const test = fixture();
    const begun = await test.flow.begin();
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    const token = new URL(begun.value.authorizationUrl).searchParams.get("state")!;
    expect(test.state()).not.toHaveProperty("verifier");
    await expect(test.flow.complete("one-time-code", token)).resolves.toEqual(Result.ok({ subject: "user-1" }));
    expect(test.exchanged()).toBe("one-time-code");
  },
);

unit("sad: rejects replayed and expired state before provider exchange", async () => {
    const replay = fixture();
    const begun = await replay.flow.begin();
    if (!begun.ok) return;
    const token = new URL(begun.value.authorizationUrl).searchParams.get("state")!;
    await replay.flow.complete("code", token);
    const repeated = await replay.flow.complete("code", token);
    expect(repeated).toMatchObject({ ok: false, error: { code: OAuthErrorCodes.replayedState } });

    const expired = fixture();
    const late = await expired.flow.begin();
    if (!late.ok) return;
    expired.expire();
    const lateToken = new URL(late.value.authorizationUrl).searchParams.get("state")!;
    const rejected = await expired.flow.complete("code", lateToken);
    expect(rejected).toMatchObject({ ok: false, error: { code: OAuthErrorCodes.expiredState } });
  },
);
`;
  return `import { expect } from "vitest";
import { unit } from "@skiesjs/testing";
import { EmailAuthErrorCodes } from "./auth-email.errors.js";
import { createEmailAuthFlow, type EmailLinkState, type EmailLinkStore } from "./auth-email.js";

const initial = new Date("2030-01-01T00:00:00.000Z");
function fixture() {
  let current = initial;
  const states = new Map<string, EmailLinkState>();
  let delivered: { readonly linkId: string; readonly token: string } | undefined;
  const store: EmailLinkStore = {
    save: async (state) => { states.set(state.linkId, state); },
    consume: async ({ linkId, tokenDigest, now }) => {
      const state = states.get(linkId);
      if (state === undefined || state.tokenDigest !== tokenDigest) return { status: "invalid" };
      if (state.consumedAt !== null) return { status: "replayed" };
      if (state.expiresAt.getTime() <= now.getTime()) return { status: "expired" };
      states.set(linkId, { ...state, consumedAt: now });
      return { status: "accepted", email: state.email };
    },
  };
  const flow = createEmailAuthFlow({
    store, pepper: "proof-only-email-pepper", now: () => current, lifetimeMs: 1_000,
    delivery: { send: async ({ linkId, token }) => { delivered = { linkId, token }; } },
  });
  return {
    flow, states, delivered: () => delivered,
    expire: () => { current = new Date(initial.getTime() + 2_000); },
  };
}

// @skies-proof ${criterion}
unit("happy: persists only a digest and consumes the emailed token once", async () => {
    const test = fixture();
    const requested = await test.flow.request("person@example.test");
    expect(requested.ok).toBe(true);
    const delivered = test.delivered();
    expect(delivered).toBeDefined();
    if (delivered === undefined) return;
    expect(test.states.get(delivered.linkId)).not.toHaveProperty("token");
    await expect(test.flow.consume(delivered.linkId, delivered.token)).resolves.toEqual({
      ok: true, value: { email: "person@example.test" },
    });
  },
);

unit("sad: rejects replay and expiry without retaining the raw token", async () => {
    const replay = fixture();
    await replay.flow.request("person@example.test");
    const link = replay.delivered();
    if (link === undefined) return;
    await replay.flow.consume(link.linkId, link.token);
    const repeated = await replay.flow.consume(link.linkId, link.token);
    expect(repeated).toMatchObject({ ok: false, error: { code: EmailAuthErrorCodes.replayed } });

    const expired = fixture();
    await expired.flow.request("person@example.test");
    const late = expired.delivered();
    if (late === undefined) return;
    expired.expire();
    const rejected = await expired.flow.consume(late.linkId, late.token);
    expect(rejected).toMatchObject({ ok: false, error: { code: EmailAuthErrorCodes.expired } });
  },
);
`;
}
