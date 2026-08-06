import type { Router } from "express";
import { Result } from "@skiesjs/core";
import { mapSlice } from "@skiesjs/express";
import { defineContract, type OpenApiRegistry } from "@skiesjs/openapi";
import { z } from "zod";

// @skies-criterion sample.health-responds
export const contract = defineContract({
  operationId: "HealthPing",
  method: "get",
  path: "/health",
  auth: "anonymous",
  kind: "internal",
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
