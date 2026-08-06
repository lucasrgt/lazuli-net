export type AuthAugment = "otp" | "oauth" | "email";

export function otpSource(): string {
  return `import { createHmac, randomInt, randomUUID } from "node:crypto";
import type { Router } from "express";
import { Errors, Result, type Result as Outcome } from "@skiesjs/core";
import { mapSlice } from "@skiesjs/express";
import { defineContract, type OpenApiRegistry } from "@skiesjs/openapi";
import { z } from "zod";
import { OtpErrorCodes } from "./auth-otp.errors.js";

export interface OtpState {
  readonly challengeId: string; readonly destination: string; readonly codeDigest: string;
  readonly expiresAt: Date; readonly consumedAt: Date | null;
}
export interface OtpStore {
  save(state: OtpState): Promise<void>;
  consume(input: { readonly challengeId: string; readonly codeDigest: string; readonly now: Date }):
    Promise<"accepted" | "invalid" | "expired" | "replayed">;
}
export interface OtpDelivery { send(input: { readonly destination: string; readonly code: string }): Promise<void> }
export interface OtpFlow {
  issue(destination: string): Promise<Outcome<{ readonly challengeId: string; readonly expiresAt: string }>>;
  verify(challengeId: string, code: string): Promise<Outcome<{ readonly verified: true }>>;
}

/** Store only a keyed digest; OtpStore.consume must compare-and-consume atomically to prevent replay. */
export function createOtpFlow(input: {
  readonly store: OtpStore; readonly delivery: OtpDelivery; readonly pepper: string;
  readonly now?: () => Date; readonly lifetimeMs?: number;
}): OtpFlow {
  if (input.pepper.length < 16) throw new Error("OTP pepper must be at least 16 characters");
  const now = input.now ?? (() => new Date());
  const lifetime = input.lifetimeMs ?? 5 * 60_000;
  const digest = (code: string) => createHmac("sha256", input.pepper).update(code).digest("hex");
  return {
    async issue(destination) {
      const challengeId = randomUUID();
      const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
      const expiresAt = new Date(now().getTime() + lifetime);
      await input.store.save({ challengeId, destination, codeDigest: digest(code), expiresAt, consumedAt: null });
      await input.delivery.send({ destination, code });
      return Result.ok({ challengeId, expiresAt: expiresAt.toISOString() });
    },
    async verify(challengeId, code) {
      const status = await input.store.consume({ challengeId, codeDigest: digest(code), now: now() });
      if (status === "accepted") return Result.ok({ verified: true });
      const error = status === "expired"
        ? Errors.unauthorized(OtpErrorCodes.expired, "OTP expired")
        : status === "replayed"
          ? Errors.conflict(OtpErrorCodes.replayed, "OTP was already consumed")
          : Errors.unauthorized(OtpErrorCodes.invalid, "OTP is invalid");
      return Result.fail(error);
    },
  };
}

export const requestOtpContract = defineContract({
  operationId: "RequestOtp", method: "post", path: "/auth/otp", auth: "anonymous", kind: "app",
  request: { body: z.object({ destination: z.string().trim().min(3) }) },
  success: { status: 202, output: z.object({ challengeId: z.string().uuid(), expiresAt: z.iso.datetime() }) },
});
export const verifyOtpContract = defineContract({
  operationId: "VerifyOtp", method: "post", path: "/auth/otp/verify", auth: "anonymous", kind: "app",
  request: { body: z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\\d{6}$/u) }) },
  success: { status: 200, output: z.object({ verified: z.literal(true) }) },
});
export function mapOtp(router: Router, openApi: OpenApiRegistry, flow: OtpFlow): void {
  openApi.registerErrorCodes(OtpErrorCodes);
  mapSlice(router, openApi, requestOtpContract, {
    toInput: ({ body }) => body.destination, handle: (destination) => flow.issue(destination),
  });
  mapSlice(router, openApi, verifyOtpContract, {
    toInput: ({ body }) => body, handle: ({ challengeId, code }) => flow.verify(challengeId, code),
  });
}
`;
}

export function oauthSource(): string {
  return `import { createHash, randomBytes } from "node:crypto";
import type { Router } from "express";
import { Errors, Result, type Result as Outcome } from "@skiesjs/core";
import { mapSlice } from "@skiesjs/express";
import { defineContract, type OpenApiRegistry } from "@skiesjs/openapi";
import { z } from "zod";
import { OAuthErrorCodes } from "./auth-oauth.errors.js";

export interface OAuthState {
  readonly stateDigest: string; readonly expiresAt: Date; readonly consumedAt: Date | null;
}
export interface OAuthStateStore {
  save(state: OAuthState): Promise<void>;
  consume(input: { readonly stateDigest: string; readonly now: Date }):
    Promise<"accepted" | "invalid" | "expired" | "replayed">;
}
export interface OAuthStateProtector {
  seal(payload: { readonly verifier: string; readonly expiresAt: string }): Promise<string>;
  open(state: string): Promise<Outcome<{ readonly verifier: string; readonly expiresAt: string }>>;
}
export interface OAuthProvider {
  authorizationUrl(input: { readonly state: string; readonly codeChallenge: string }): string;
  exchange(input: { readonly code: string; readonly verifier: string }): Promise<Outcome<{ readonly subject: string }>>;
}
export interface OAuthFlow {
  begin(): Promise<Outcome<{ readonly authorizationUrl: string }>>;
  complete(code: string, state: string): Promise<Outcome<{ readonly subject: string }>>;
}

/** The store receives only a digest; the PKCE verifier exists only inside a state token sealed by the injected protector. */
export function createOAuthFlow(input: {
  readonly states: OAuthStateStore; readonly protector: OAuthStateProtector; readonly provider: OAuthProvider;
  readonly now?: () => Date; readonly lifetimeMs?: number;
}): OAuthFlow {
  const now = input.now ?? (() => new Date());
  const lifetime = input.lifetimeMs ?? 10 * 60_000;
  const hash = (value: string) => createHash("sha256").update(value).digest("base64url");
  return {
    async begin() {
      const verifier = randomBytes(32).toString("base64url");
      const expiresAt = new Date(now().getTime() + lifetime);
      const state = await input.protector.seal({ verifier, expiresAt: expiresAt.toISOString() });
      await input.states.save({ stateDigest: hash(state), expiresAt, consumedAt: null });
      return Result.ok({ authorizationUrl: input.provider.authorizationUrl({ state, codeChallenge: hash(verifier) }) });
    },
    async complete(code, state) {
      const status = await input.states.consume({ stateDigest: hash(state), now: now() });
      if (status !== "accepted") {
        const error = status === "expired" ? Errors.unauthorized(OAuthErrorCodes.expiredState, "OAuth state expired")
          : status === "replayed" ? Errors.conflict(OAuthErrorCodes.replayedState, "OAuth state was already consumed")
            : Errors.unauthorized(OAuthErrorCodes.invalidState, "OAuth state is invalid");
        return Result.fail(error);
      }
      const opened = await input.protector.open(state);
      if (!opened.ok) return opened;
      if (new Date(opened.value.expiresAt).getTime() <= now().getTime()) {
        return Result.fail(Errors.unauthorized(OAuthErrorCodes.expiredState, "OAuth state expired"));
      }
      return input.provider.exchange({ code, verifier: opened.value.verifier });
    },
  };
}

export const beginOAuthContract = defineContract({
  operationId: "BeginOAuth", method: "get", path: "/auth/oauth", auth: "anonymous", kind: "app", request: {},
  success: { status: 200, output: z.object({ authorizationUrl: z.string().url() }) },
});
export const completeOAuthContract = defineContract({
  operationId: "CompleteOAuth", method: "post", path: "/auth/oauth/callback", auth: "anonymous", kind: "app",
  request: { body: z.object({ code: z.string().min(1), state: z.string().min(1) }) },
  success: { status: 200, output: z.object({ subject: z.string().min(1) }) },
});
export function mapOAuth(router: Router, openApi: OpenApiRegistry, flow: OAuthFlow): void {
  openApi.registerErrorCodes(OAuthErrorCodes);
  mapSlice(router, openApi, beginOAuthContract, { toInput: () => ({}), handle: () => flow.begin() });
  mapSlice(router, openApi, completeOAuthContract, {
    toInput: ({ body }) => body, handle: ({ code, state }) => flow.complete(code, state),
  });
}
`;
}

export function emailSource(): string {
  return `import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { Router } from "express";
import { Errors, Result, type Result as Outcome } from "@skiesjs/core";
import { mapSlice } from "@skiesjs/express";
import { defineContract, type OpenApiRegistry } from "@skiesjs/openapi";
import { z } from "zod";
import { EmailAuthErrorCodes } from "./auth-email.errors.js";

export interface EmailLinkState {
  readonly linkId: string; readonly email: string; readonly tokenDigest: string;
  readonly expiresAt: Date; readonly consumedAt: Date | null;
}
export interface EmailLinkStore {
  save(state: EmailLinkState): Promise<void>;
  consume(input: { readonly linkId: string; readonly tokenDigest: string; readonly now: Date }): Promise<
    { readonly status: "accepted"; readonly email: string }
    | { readonly status: "invalid" | "expired" | "replayed" }
  >;
}
export interface EmailLinkDelivery {
  send(input: { readonly email: string; readonly linkId: string; readonly token: string; readonly expiresAt: Date }): Promise<void>;
}
export interface EmailAuthFlow {
  request(email: string): Promise<Outcome<{ readonly linkId: string; readonly expiresAt: string }>>;
  consume(linkId: string, token: string): Promise<Outcome<{ readonly email: string }>>;
}

/** The raw one-time token is delivered but never persisted; consume must compare-and-consume atomically. */
export function createEmailAuthFlow(input: {
  readonly store: EmailLinkStore; readonly delivery: EmailLinkDelivery; readonly pepper: string;
  readonly now?: () => Date; readonly lifetimeMs?: number;
}): EmailAuthFlow {
  if (input.pepper.length < 16) throw new Error("email-link pepper must be at least 16 characters");
  const now = input.now ?? (() => new Date());
  const lifetime = input.lifetimeMs ?? 15 * 60_000;
  const digest = (token: string) => createHmac("sha256", input.pepper).update(token).digest("hex");
  return {
    async request(email) {
      const linkId = randomUUID();
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(now().getTime() + lifetime);
      await input.store.save({ linkId, email, tokenDigest: digest(token), expiresAt, consumedAt: null });
      await input.delivery.send({ email, linkId, token, expiresAt });
      return Result.ok({ linkId, expiresAt: expiresAt.toISOString() });
    },
    async consume(linkId, token) {
      const consumed = await input.store.consume({ linkId, tokenDigest: digest(token), now: now() });
      if (consumed.status === "accepted") return Result.ok({ email: consumed.email });
      const error = consumed.status === "expired" ? Errors.unauthorized(EmailAuthErrorCodes.expired, "link expired")
        : consumed.status === "replayed" ? Errors.conflict(EmailAuthErrorCodes.replayed, "link was already consumed")
          : Errors.unauthorized(EmailAuthErrorCodes.invalid, "link is invalid");
      return Result.fail(error);
    },
  };
}

export const requestEmailContract = defineContract({
  operationId: "RequestEmailAuth", method: "post", path: "/auth/email", auth: "anonymous", kind: "app",
  request: { body: z.object({ email: z.email() }) },
  success: { status: 202, output: z.object({ linkId: z.string().uuid(), expiresAt: z.iso.datetime() }) },
});
export const consumeEmailContract = defineContract({
  operationId: "ConsumeEmailAuth", method: "post", path: "/auth/email/consume", auth: "anonymous", kind: "app",
  request: { body: z.object({ linkId: z.string().uuid(), token: z.string().min(32) }) },
  success: { status: 200, output: z.object({ email: z.email() }) },
});
export function mapEmailAuth(router: Router, openApi: OpenApiRegistry, flow: EmailAuthFlow): void {
  openApi.registerErrorCodes(EmailAuthErrorCodes);
  mapSlice(router, openApi, requestEmailContract, {
    toInput: ({ body }) => body.email, handle: (email) => flow.request(email),
  });
  mapSlice(router, openApi, consumeEmailContract, {
    toInput: ({ body }) => body, handle: ({ linkId, token }) => flow.consume(linkId, token),
  });
}
`;
}


export function authAugmentErrorSource(mode: AuthAugment): string {
  if (mode === "otp") return `import { defineErrorCodes } from "@skiesjs/openapi";

export const OtpErrorCodes = defineErrorCodes({
  invalid: "auth.otp.invalid",
  expired: "auth.otp.expired",
  replayed: "auth.otp.replayed",
});
`;
  if (mode === "oauth") return `import { defineErrorCodes } from "@skiesjs/openapi";

export const OAuthErrorCodes = defineErrorCodes({
  invalidState: "auth.oauth.invalid_state",
  expiredState: "auth.oauth.expired_state",
  replayedState: "auth.oauth.replayed_state",
});
`;
  return `import { defineErrorCodes } from "@skiesjs/openapi";

export const EmailAuthErrorCodes = defineErrorCodes({
  invalid: "auth.email.invalid",
  expired: "auth.email.expired",
  replayed: "auth.email.replayed",
});
`;
}
