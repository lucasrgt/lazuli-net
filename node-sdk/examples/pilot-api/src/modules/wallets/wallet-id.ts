import { Errors, Result, scalarCodec, type Result as ResultOutcome } from "@skiesjs/core";
import { scalarSchema } from "@skiesjs/openapi";
import { z } from "zod";
import { WalletErrorCodes } from "./wallets.errors.js";

declare const walletIdBrand: unique symbol;

export type WalletId = string & { readonly [walletIdBrand]: "WalletId" };

const uuidWireSchema = z.uuid();

export function createWalletId(value: string): ResultOutcome<WalletId> {
  const parsed = uuidWireSchema.safeParse(value);
  return parsed.success
    ? Result.ok(parsed.data as WalletId)
    : Result.fail(Errors.businessRule(WalletErrorCodes.invalidWalletId, "wallet id must be a UUID"));
}

export const walletIdCodec = scalarCodec<WalletId, string>({
  primitive: { type: "string", format: "uuid" },
  encode: (value) => value,
  decode: createWalletId,
});

export const walletIdSchema = scalarSchema(walletIdCodec);
