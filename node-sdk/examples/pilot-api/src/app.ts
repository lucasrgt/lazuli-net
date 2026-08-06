import express, { type Express } from "express";
import type { AccessTokens } from "@skiesjs/auth";
import { serveOpenApi } from "@skiesjs/express";
import { createOpenApiRegistry, type OpenApiRegistry } from "@skiesjs/openapi";
import { type LocalFileStorage } from "@skiesjs/storage";
import { mapLocalFiles } from "@skiesjs/storage-express";
import type { ListWallets } from "./modules/wallets/list-wallets.slice.js";
import { mapModules } from "./modules.js";

export interface ApplicationDependencies {
  readonly accessTokens: AccessTokens;
  readonly listWallets: ListWallets;
  readonly storage: LocalFileStorage;
}

export interface PilotApplication {
  readonly app: Express;
  readonly openApi: OpenApiRegistry;
}

export function createApplication(dependencies: ApplicationDependencies): PilotApplication {
  const app = express();
  const openApi = createOpenApiRegistry({
    title: "Skies Wallet Pilot API",
    version: "0.1.0",
    description: "Explicit Express 5 composition with auth, paging, local storage, and live contracts.",
  });

  mapLocalFiles(app, dependencies.storage, { routePrefix: "/files" });
  app.use(express.json());
  mapModules(app, openApi, {
    wallets: {
      accessTokens: dependencies.accessTokens,
      listWallets: dependencies.listWallets,
    },
  });
  app.get("/openapi/v1.json", serveOpenApi(openApi));
  app.get("/openapi/app-v1.json", serveOpenApi(openApi, { audience: "app-client" }));

  return { app, openApi };
}
