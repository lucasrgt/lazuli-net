import type { Request, RequestHandler, Response } from "express";
import { AccessTokens, InvalidAccessTokenError, type CurrentUser } from "@skiesjs/auth";
import { Result } from "@skiesjs/core";
import { toHttp } from "@skiesjs/express";

/** Express locals established only after an access token has been verified. */
export interface AuthenticatedLocals extends Record<string, unknown> {
  /** The identity reconstructed from the verified access token. */
  currentUser: CurrentUser;
}

/**
 * Read the authenticated identity established by {@link requireJwt}. Failing loudly when the
 * middleware is absent prevents a protected handler from accidentally treating missing identity as anonymous.
 */
export function currentUser(response: Response): CurrentUser {
  const user = (response.locals as Partial<AuthenticatedLocals>).currentUser;
  if (user === undefined) {
    throw new Error("requireJwt middleware must run before currentUser");
  }
  return user;
}

/**
 * Require exactly one Bearer credential, verify it, and expose its typed current user to downstream handlers.
 * Missing, malformed, expired, and invalid credentials all stop the pipeline at the canonical 401 boundary.
 */
export function requireJwt(accessTokens: AccessTokens): RequestHandler {
  return async (request: Request, response: Response, next): Promise<void> => {
    const token = bearerToken(request.headers.authorization);
    const verified = token === undefined
      ? Result.fail(InvalidAccessTokenError)
      : await accessTokens.verify(token);

    if (!verified.ok) {
      response.set("WWW-Authenticate", "Bearer");
      toHttp(Result.fail(InvalidAccessTokenError), response);
      return;
    }

    (response.locals as AuthenticatedLocals).currentUser = verified.value;
    next();
  };
}

function bearerToken(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  return /^Bearer ([^\s]+)$/iu.exec(header)?.[1];
}
