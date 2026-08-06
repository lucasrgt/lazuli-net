import express from "express";
import { mapModules } from "./modules.js";

export const app = express();
app.use(express.json());
mapModules(app);
