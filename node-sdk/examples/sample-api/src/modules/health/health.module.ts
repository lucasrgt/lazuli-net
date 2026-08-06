import { Router, type Express } from "express";
import * as Ping from "./ping.slice.js";

export function map(app: Express): void {
  const health = Router();
  Ping.map(health);
  app.use(health);
}
