import type { Express } from "express";
import type { OpenApiRegistry } from "@skiesjs/openapi";
import * as Wallets from "./modules/wallets/wallets.module.js";

export interface ModuleDependencies {
  readonly wallets: Wallets.Dependencies;
}

export function mapModules(app: Express, openApi: OpenApiRegistry, dependencies: ModuleDependencies): void {
  Wallets.map(app, openApi, dependencies.wallets);
}
