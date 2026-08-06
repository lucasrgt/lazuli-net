import type { Router } from "express";
import { Result } from "@skiesjs/core";
import { mapSlice } from "@skiesjs/express";
import { defineContract, type OpenApiRegistry } from "@skiesjs/openapi";
import { z } from "zod";

// @skies-criterion pilot.health-openapi
export const contract = defineContract({
  operationId: "Wallets.Health",
  method: "get",
  path: "/health",
  auth: "anonymous",
  kind: "internal",
  summary: "Process liveness",
  tags: ["Internal"],
  request: {},
  success: { status: 200, output: z.object({ status: z.literal("ok") }) },
});

export type Input = Record<string, never>;

export interface Output {
  readonly status: "ok";
}

export async function handle(_input: Input): Promise<Result<Output>> {
  return Result.ok({ status: "ok" });
}

export function map(router: Router, openApi: OpenApiRegistry): void {
  mapSlice(router, openApi, contract, { toInput: () => ({}), handle });
}
