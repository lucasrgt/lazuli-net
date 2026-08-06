import type { Express } from "express";
import * as Health from "./modules/health/health.module.js";

export function mapModules(app: Express): void {
  Health.map(app);
}
