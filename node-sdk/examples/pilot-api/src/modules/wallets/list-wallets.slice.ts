import type { Router } from "express";
import type { AccessTokens, CurrentUser } from "@skiesjs/auth";
import { currentUser, requireJwt } from "@skiesjs/auth-express";
import { Errors, Result, type Page } from "@skiesjs/core";
import { mapSlice } from "@skiesjs/express";
import { defineContract, type OpenApiRegistry } from "@skiesjs/openapi";
import { z } from "zod";
import { walletIdSchema, type WalletId } from "./wallet-id.js";
import { WalletErrorCodes } from "./wallets.errors.js";

const querySchema = z.object({
  pageNumber: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).default(20),
});

const walletSchema = z.object({
  walletId: walletIdSchema,
  displayName: z.string(),
  createdAt: z.iso.datetime(),
});

// @skies-criterion pilot.wallet-list
export const contract = defineContract({
  operationId: "Wallets.List",
  method: "get",
  path: "/wallets",
  auth: "required",
  kind: "app",
  summary: "List wallets in deterministic creation order",
  tags: ["Wallets"],
  request: { query: querySchema },
  success: {
    status: 200,
    output: z.object({
      items: z.array(walletSchema),
      totalCount: z.number().int().nonnegative(),
      pageNumber: z.number().int().positive(),
      pageSize: z.number().int().positive(),
    }),
  },
});

export interface Input {
  readonly pageNumber: number;
  readonly pageSize: number;
  readonly signal?: AbortSignal;
}

export interface WalletSummary {
  readonly walletId: WalletId;
  readonly displayName: string;
  readonly createdAt: string;
}

export interface Output {
  readonly items: WalletSummary[];
  readonly totalCount: number;
  readonly pageNumber: number;
  readonly pageSize: number;
}

export interface ListWalletsInput extends Input {
  readonly orgId: string;
}

export type ListWallets = (input: ListWalletsInput) => Promise<Page<WalletSummary>>;

export async function handle(
  input: Input,
  user: CurrentUser,
  listWallets: ListWallets,
): Promise<Result<Output>> {
  try {
    const page = await listWallets({ ...input, orgId: user.orgId });
    return Result.ok({ ...page, items: [...page.items] });
  } catch {
    return Result.fail(Errors.unavailable(WalletErrorCodes.databaseUnavailable, "wallet database unavailable"));
  }
}

export interface MapDependencies {
  readonly accessTokens: AccessTokens;
  readonly listWallets: ListWallets;
}

export function map(router: Router, openApi: OpenApiRegistry, dependencies: MapDependencies): void {
  mapSlice(router, openApi, contract, {
    authorize: requireJwt(dependencies.accessTokens),
    toInput: ({ query }) => ({ pageNumber: query.pageNumber, pageSize: query.pageSize }),
    handle: (input, { response }) => handle(input, currentUser(response), dependencies.listWallets),
  });
}
