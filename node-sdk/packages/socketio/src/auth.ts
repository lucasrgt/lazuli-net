import { AccessTokens, InvalidAccessTokenError, type CurrentUser } from "@skiesjs/auth";
import { Result, type Result as ResultOutcome } from "@skiesjs/core";
import type { Server, Socket } from "socket.io";

const ACCESS_TOKEN_AUTHENTICATION = Symbol("skies.socketio.access-token-authentication");

type SocketMiddleware = Parameters<Server["use"]>[0];

/** The connection-error data returned when a supplied access token cannot be verified. */
export type SocketAuthenticationErrorData = ResultOutcome<never>;

/**
 * A branded, framework-specific authentication boundary created only by
 * {@link accessTokenAuthentication}. The adapter installs its real Socket.IO middleware.
 */
export interface AccessTokenAuthentication {
  readonly [ACCESS_TOKEN_AUTHENTICATION]: true;
  /** Socket.IO middleware that verifies a supplied handshake access token. */
  readonly middleware: SocketMiddleware;
  /** Return the identity established for one socket, when present. */
  readonly currentUser: (socket: Socket) => CurrentUser | undefined;
}

function accessTokenFrom(socket: Socket): string | undefined | null {
  const authentication = socket.handshake.auth as Record<string, unknown> | null | undefined;
  if (authentication === null || authentication === undefined) return undefined;
  const value = authentication["accessToken"];
  if (value === undefined) return undefined;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function invalidAccessToken(): Error & { data: SocketAuthenticationErrorData } {
  return Object.assign(new Error(InvalidAccessTokenError.message), {
    data: Result.fail(InvalidAccessTokenError),
  });
}

/**
 * Build explicit optional connection authentication from the canonical Skies AccessTokens verifier.
 * Clients supply the raw JWT as `handshake.auth.accessToken`. Missing credentials remain anonymous;
 * any credential that is present but malformed, expired, or invalid rejects the connection.
 */
export function accessTokenAuthentication(accessTokens: AccessTokens): AccessTokenAuthentication {
  if (!(accessTokens instanceof AccessTokens)) {
    throw new TypeError("accessTokens must be an AccessTokens instance");
  }
  const currentUsers = new WeakMap<Socket, CurrentUser>();
  const middleware: SocketMiddleware = async (socket, next): Promise<void> => {
    const token = accessTokenFrom(socket);
    if (token === undefined) {
      next();
      return;
    }
    if (token === null) {
      next(invalidAccessToken());
      return;
    }
    const verified = await accessTokens.verify(token);
    if (!verified.ok) {
      next(invalidAccessToken());
      return;
    }
    currentUsers.set(socket, verified.value);
    next();
  };

  return Object.freeze({
    [ACCESS_TOKEN_AUTHENTICATION]: true as const,
    middleware,
    currentUser: (socket: Socket) => currentUsers.get(socket),
  });
}

/** @internal Runtime guard preventing required auth from accepting an arbitrary middleware-shaped object. */
export function isAccessTokenAuthentication(value: unknown): value is AccessTokenAuthentication {
  return typeof value === "object"
    && value !== null
    && (value as Partial<AccessTokenAuthentication>)[ACCESS_TOKEN_AUTHENTICATION] === true;
}
