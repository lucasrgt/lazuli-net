import { Router, type Express } from "express";
import { AuthErrorCodes, type AccessTokens } from "@skiesjs/auth";
import type { OpenApiRegistry } from "@skiesjs/openapi";
import * as Health from "./health.slice.js";
import * as IssueToken from "./issue-token.slice.js";
import * as ListWallets from "./list-wallets.slice.js";
import { WalletErrorCodes } from "./wallets.errors.js";

export interface Dependencies {
  readonly accessTokens: AccessTokens;
  readonly listWallets: ListWallets.ListWallets;
}

export function map(app: Express, openApi: OpenApiRegistry, dependencies: Dependencies): void {
  const router = Router();
  openApi.registerErrorCodes(AuthErrorCodes);
  openApi.registerErrorCodes(WalletErrorCodes);
  Health.map(router, openApi);
  IssueToken.map(router, openApi, dependencies.accessTokens);
  ListWallets.map(router, openApi, dependencies);
  app.use(router);
}
