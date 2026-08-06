import type { Router } from "express";
import { Result } from "@skiesjs/core";
import { endpoint } from "@skiesjs/express";

export type Input = Record<string, never>;

export interface Output {
  readonly status: "ok";
}

export async function handle(_input: Input): Promise<Result<Output>> {
  return Result.ok({ status: "ok" });
}

export function map(router: Router): void {
  router.get("/health", endpoint(() => handle({})));
}
