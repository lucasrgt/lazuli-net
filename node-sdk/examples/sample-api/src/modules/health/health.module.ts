import { Router, type Express } from "express";
import type { OpenApiRegistry } from "@skiesjs/openapi";
import * as Ping from "./ping.slice.js";

export function map(app: Express, openApi: OpenApiRegistry): void {
  const health = Router();
  Ping.map(health, openApi);
  app.use(health);
}
