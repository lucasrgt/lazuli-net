import { defineErrorCodes } from "@skiesjs/openapi";

export const WalletErrorCodes = defineErrorCodes({
  databaseUnavailable: "wallets.database_unavailable",
  invalidWalletId: "wallets.invalid_id",
});
