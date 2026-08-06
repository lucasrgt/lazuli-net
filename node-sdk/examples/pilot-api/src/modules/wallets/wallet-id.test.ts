import { expect } from "vitest";
import { unit } from "@skiesjs/testing";
import { createWalletId, walletIdCodec, walletIdSchema } from "./wallet-id.js";
import { WalletErrorCodes } from "./wallets.errors.js";

const walletId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

unit("WalletId codec decodes its UUID wire value and encodes the brand", () => {
  const decoded = walletIdSchema.parse(walletId);

  expect(walletIdCodec.encode(decoded)).toBe(walletId);
  expect(createWalletId("not-a-uuid")).toMatchObject({
    ok: false,
    error: { code: WalletErrorCodes.invalidWalletId, message: "wallet id must be a UUID" },
  });
});
