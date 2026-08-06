import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ErrorKind, type FieldError, type Result, type SkiesError } from "@skiesjs/core";

/** The stable error envelope returned by every Skies Express endpoint. */
export interface ErrorBody {
  readonly error: SkiesError["kind"];
  readonly code: string;
  readonly message: string;
  readonly fields: readonly FieldError[] | null;
}

/** Options that belong to the HTTP boundary rather than a slice handler. */
export interface EndpointOptions {
  readonly successStatus?: number;
}

/** An HTTP-aware mapper around an HTTP-agnostic slice handler. */
export type ResultHandler<T> = (request: Request, response: Response) => Result<T> | Promise<Result<T>>;

const statuses: Readonly<Record<SkiesError["kind"], number>> = {
  [ErrorKind.Validation]: 400,
  [ErrorKind.Unauthorized]: 401,
  [ErrorKind.Forbidden]: 403,
  [ErrorKind.NotFound]: 404,
  [ErrorKind.Conflict]: 409,
  [ErrorKind.BusinessRule]: 422,
  [ErrorKind.RateLimit]: 429,
  [ErrorKind.Internal]: 500,
  [ErrorKind.Unavailable]: 503,
};

/** Render one handler outcome using the canonical Skies status and error envelope. */
export function toHttp<T>(result: Result<T>, response: Response, options: EndpointOptions = {}): void {
  if (result.ok) {
    const status = options.successStatus ?? 200;
    if (status === 204) response.status(status).send();
    else response.status(status).json(result.value);
    return;
  }

  const body: ErrorBody = {
    error: result.error.kind,
    code: result.error.code,
    message: result.error.message,
    fields: result.error.fields ?? null,
  };
  response.status(statuses[result.error.kind]).json(body);
}

/**
 * Adapt a result-returning handler to Express. Unexpected exceptions continue through Express's error pipeline;
 * expected failures must be represented as `Result.fail`.
 */
export function endpoint<T>(handler: ResultHandler<T>, options: EndpointOptions = {}): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      toHttp(await handler(request, response), response, options);
    } catch (caught) {
      next(caught);
    }
  };
}
