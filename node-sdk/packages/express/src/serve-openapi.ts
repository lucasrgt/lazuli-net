import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  createOpenApiDocument,
  type OpenApiAudience,
  type OpenApiRegistry,
} from "@skiesjs/openapi";

/** Select which explicit endpoint audience is served. */
export interface ServeOpenApiOptions {
  readonly audience?: OpenApiAudience;
}

/**
 * Create an Express handler that generates the current OpenAPI document on each request. Keeping generation live
 * means error-code registries registered during explicit composition are never hidden behind a startup snapshot.
 */
export function serveOpenApi(
  registry: OpenApiRegistry,
  options: ServeOpenApiOptions = {},
): RequestHandler {
  return (_request: Request, response: Response, next: NextFunction): void => {
    try {
      response.json(createOpenApiDocument(registry, options));
    } catch (caught) {
      next(caught);
    }
  };
}
