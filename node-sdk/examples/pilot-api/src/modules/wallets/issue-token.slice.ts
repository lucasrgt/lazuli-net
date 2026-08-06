import type { Router } from "express";
import { type AccessTokens } from "@skiesjs/auth";
import { Result } from "@skiesjs/core";
import { mapSlice } from "@skiesjs/express";
import { defineContract, type OpenApiRegistry } from "@skiesjs/openapi";
import { z } from "zod";

const tokenRequestSchema = z.object({
  userId: z.uuid(),
  orgId: z.uuid(),
  sessionId: z.uuid(),
  role: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1).nullable().optional(),
});

// @skies-criterion pilot.token-issued
export const contract = defineContract({
  operationId: "Wallets.IssuePilotToken",
  method: "post",
  path: "/wallets/token",
  auth: "anonymous",
  kind: "app",
  summary: "Issue a short-lived pilot access token",
  tags: ["Wallets"],
  request: { body: tokenRequestSchema },
  success: {
    status: 201,
    output: z.object({ accessToken: z.string(), expiresInSeconds: z.literal(900) }),
  },
});

export interface Input {
  readonly userId: string;
  readonly orgId: string;
  readonly sessionId: string;
  readonly role: string | null;
  readonly name: string | null;
}

export interface Output {
  readonly accessToken: string;
  readonly expiresInSeconds: 900;
}

export async function handle(input: Input, accessTokens: AccessTokens): Promise<Result<Output>> {
  const token = await accessTokens.issue(input.userId, input.orgId, input.role, input.sessionId, input.name);
  return Result.ok({ accessToken: token, expiresInSeconds: 900 });
}

export function map(router: Router, openApi: OpenApiRegistry, accessTokens: AccessTokens): void {
  mapSlice(router, openApi, contract, {
    toInput: ({ body }) => ({
      userId: body.userId,
      orgId: body.orgId,
      sessionId: body.sessionId,
      role: body.role ?? null,
      name: body.name ?? null,
    }),
    handle: (input) => handle(input, accessTokens),
  });
}
