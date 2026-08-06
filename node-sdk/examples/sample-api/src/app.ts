import express from "express";
import { serveOpenApi } from "@skiesjs/express";
import { createOpenApiRegistry } from "@skiesjs/openapi";
import { mapModules } from "./modules.js";

export const app = express();
export const openApi = createOpenApiRegistry({ title: "Skies sample API", version: "0.1.0" });
app.use(express.json());
mapModules(app, openApi);
app.get("/openapi/v1.json", serveOpenApi(openApi));
