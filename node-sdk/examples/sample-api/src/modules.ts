import type { Express } from "express";
import type { OpenApiRegistry } from "@skiesjs/openapi";
import * as Health from "./modules/health/health.module.js";

export function mapModules(app: Express, openApi: OpenApiRegistry): void {
  Health.map(app, openApi);
}
