import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { AccessTokens, InvalidAccessTokenError, type CurrentUser } from "@skiesjs/auth";
import { ErrorKind, Errors, Result, type Result as ResultOutcome } from "@skiesjs/core";
import { Server } from "socket.io";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import { z } from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  accessTokenAuthentication,
  createSocketIoAdapter,
  defineSocketEvent,
  type SocketAdapterErrorContext,
  type SocketIoAdapter,
} from "./index.js";

const SECRET = "socketio-test-secret-for-jwt-signing-long-enough-for-hs256";
const ISSUER = "socketio-tests";
const AUDIENCE = "socketio-test-api";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

interface Harness {
  readonly http: HttpServer;
  readonly io: Server;
  readonly url: string;
  readonly clients: ClientSocket[];
  close(): Promise<void>;
}

async function harness(): Promise<Harness> {
  const http = createServer();
  const io = new Server(http, { serveClient: false });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", resolve);
  });
  const address = http.address() as AddressInfo;
  const clients: ClientSocket[] = [];
  return {
    http,
    io,
    url: `http://127.0.0.1:${address.port}`,
    clients,
    close: async () => {
      for (const client of clients) client.disconnect();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (http.listening) {
        await new Promise<void>((resolve, reject) => {
          http.close((error) => error === undefined ? resolve() : reject(error));
        });
      }
    },
  };
}

async function connect(
  target: Harness,
  auth?: Record<string, unknown>,
): Promise<ClientSocket> {
  const client = connectClient(target.url, {
    ...(auth === undefined ? {} : { auth }),
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  });
  target.clients.push(client);
  return new Promise((resolve, reject) => {
    client.once("connect", () => resolve(client));
    client.once("connect_error", reject);
  });
}

function emitAck<T>(
  client: ClientSocket,
  event: string,
  payload: unknown,
  timeout = 500,
): Promise<T> {
  return new Promise((resolve, reject) => {
    client.timeout(timeout).emit(event, payload, (error: Error | null, response: T) => {
      if (error !== null) reject(error);
      else resolve(response);
    });
  });
}

function tokens(): AccessTokens {
  return new AccessTokens(SECRET, ISSUER, AUDIENCE);
}

function echoContract(operationId = "EchoMessage", event = "message:echo") {
  return defineSocketEvent({
    operationId,
    event,
    auth: "optional",
    payload: z.object({ text: z.string().trim().min(1), count: z.number().int().positive() }),
    output: z.object({ echoed: z.string(), count: z.number().int() }),
  });
}

function adapterFor(
  target: Harness,
  errors: Array<{ error: unknown; context: SocketAdapterErrorContext }> = [],
): SocketIoAdapter {
  return createSocketIoAdapter(target.io, {
    onError: (error, context) => errors.push({ error, context }),
  });
}

describe("Socket.IO adapter", () => {
  it("validates and decodes one payload before acknowledging a successful Result", async () => {
    const target = await harness();
    try {
      const adapter = adapterFor(target);
      const contract = echoContract();
      adapter.register(contract, (payload, context) => {
        expectTypeOf(payload).toEqualTypeOf<{ text: string; count: number }>();
        expectTypeOf(context.currentUser).toEqualTypeOf<CurrentUser | undefined>();
        expect(context.signal.aborted).toBe(false);
        return Result.ok({ echoed: payload.text, count: payload.count });
      });
      const client = await connect(target);

      const acknowledgement = await emitAck(client, contract.event, { text: "  skies  ", count: 2 });

      expect(acknowledgement).toEqual(Result.ok({ echoed: "skies", count: 2 }));
    } finally {
      await target.close();
    }
  });

  it("maps every Zod issue to the canonical sorted Skies validation failure", async () => {
    const target = await harness();
    let calls = 0;
    try {
      const adapter = adapterFor(target);
      const contract = echoContract();
      adapter.register(contract, () => {
        calls += 1;
        return Result.ok({ echoed: "not reached", count: 0 });
      });
      const client = await connect(target);

      const acknowledgement = await emitAck<ResultOutcome<never>>(
        client,
        contract.event,
        { text: "", count: -1 },
      );

      expect(acknowledgement).toEqual({
        ok: false,
        error: {
          kind: ErrorKind.Validation,
          code: "validation.failed",
          message: "Validation failed",
          fields: [
            {
              field: "payload.count",
              code: "validation.too_small",
              message: "Too small: expected number to be >0",
            },
            {
              field: "payload.text",
              code: "validation.too_small",
              message: "Too small: expected string to have >=1 characters",
            },
          ],
        },
      });
      expect(calls).toBe(0);
    } finally {
      await target.close();
    }
  });

  it("requires an explicit AccessTokens authentication boundary for required contracts", async () => {
    const target = await harness();
    try {
      const adapter = adapterFor(target);
      const contract = defineSocketEvent({
        operationId: "ReadProfile",
        event: "profile:read",
        auth: "required",
        payload: z.object({}),
        output: z.object({ userId: z.string() }),
      });

      expect(() => adapter.register(
        contract,
        (_payload, { currentUser }) => Result.ok({ userId: currentUser.userId }),
      )).toThrow("ReadProfile requires explicit AccessTokens authentication middleware");
    } finally {
      await target.close();
    }
  });

  it("returns the canonical unauthorized Result for a missing required credential", async () => {
    const target = await harness();
    let calls = 0;
    try {
      const adapter = createSocketIoAdapter(target.io, {
        authentication: accessTokenAuthentication(tokens()),
        onError: () => undefined,
      });
      const contract = defineSocketEvent({
        operationId: "ReadProfile",
        event: "profile:read",
        auth: "required",
        payload: z.object({}),
        output: z.object({ userId: z.string() }),
      });
      adapter.register(contract, () => {
        calls += 1;
        return Result.ok({ userId: USER_ID });
      });
      const client = await connect(target);

      expect(await emitAck(client, contract.event, {})).toEqual(Result.fail(InvalidAccessTokenError));
      expect(calls).toBe(0);
    } finally {
      await target.close();
    }
  });

  it("verifies a valid handshake token and exposes a statically required CurrentUser", async () => {
    const target = await harness();
    const accessTokens = tokens();
    try {
      const adapter = createSocketIoAdapter(target.io, {
        authentication: accessTokenAuthentication(accessTokens),
        onError: () => undefined,
      });
      const contract = defineSocketEvent({
        operationId: "ReadProfile",
        event: "profile:read",
        auth: "required",
        payload: z.object({}),
        output: z.object({ userId: z.string(), orgId: z.string(), role: z.string().nullable() }),
      });
      adapter.register(contract, (_payload, { currentUser }) => {
        expectTypeOf(currentUser).toEqualTypeOf<CurrentUser>();
        return Result.ok({
          userId: currentUser.userId,
          orgId: currentUser.orgId,
          role: currentUser.role,
        });
      });
      const jwt = await accessTokens.issue(USER_ID, ORG_ID, "admin", SESSION_ID, "Ada");
      const client = await connect(target, { accessToken: jwt });

      expect(await emitAck(client, contract.event, {})).toEqual(Result.ok({
        userId: USER_ID,
        orgId: ORG_ID,
        role: "admin",
      }));
    } finally {
      await target.close();
    }
  });

  it("rejects a supplied invalid token in real Socket.IO connection middleware", async () => {
    const target = await harness();
    try {
      createSocketIoAdapter(target.io, {
        authentication: accessTokenAuthentication(tokens()),
        onError: () => undefined,
      });
      const client = connectClient(target.url, {
        auth: { accessToken: "not-a-jwt" },
        forceNew: true,
        reconnection: false,
        transports: ["websocket"],
      });
      target.clients.push(client);

      const error = await new Promise<Error & { data?: unknown }>((resolve) => {
        client.once("connect_error", resolve);
      });

      expect(error.message).toBe("invalid access token");
      expect(error.data).toEqual(Result.fail(InvalidAccessTokenError));
      expect(client.connected).toBe(false);
    } finally {
      await target.close();
    }
  });

  it("makes optional auth anonymous or verified without exposing transport globals", async () => {
    const target = await harness();
    const accessTokens = tokens();
    try {
      const adapter = createSocketIoAdapter(target.io, {
        authentication: accessTokenAuthentication(accessTokens),
        onError: () => undefined,
      });
      const contract = defineSocketEvent({
        operationId: "WhoAmI",
        event: "identity:current",
        auth: "optional",
        payload: z.object({}),
        output: z.object({ userId: z.string().nullable() }),
      });
      adapter.register(contract, (_payload, context) => Result.ok({
        userId: context.currentUser?.userId ?? null,
      }));
      const anonymous = await connect(target);
      const jwt = await accessTokens.issue(USER_ID, ORG_ID, null, SESSION_ID, null);
      const authenticated = await connect(target, { accessToken: jwt });

      expect(await emitAck(anonymous, contract.event, {})).toEqual(Result.ok({ userId: null }));
      expect(await emitAck(authenticated, contract.event, {})).toEqual(Result.ok({ userId: USER_ID }));
    } finally {
      await target.close();
    }
  });

  it("preserves expected domain failures in the acknowledgement envelope", async () => {
    const target = await harness();
    try {
      const adapter = adapterFor(target);
      const contract = echoContract();
      const failure = Errors.conflict("messages.duplicate", "message already exists");
      adapter.register(contract, () => Result.fail(failure));
      const client = await connect(target);

      expect(await emitAck(client, contract.event, { text: "hello", count: 1 }))
        .toEqual(Result.fail(failure));
    } finally {
      await target.close();
    }
  });

  it("detects operation and event collisions and releases both IDs on removal", async () => {
    const target = await harness();
    try {
      const adapter = adapterFor(target);
      const first = echoContract();
      const registration = adapter.register(first, ({ text, count }) => Result.ok({ echoed: text, count }));

      expect(() => adapter.register(
        echoContract(first.operationId, "message:other"),
        ({ text, count }) => Result.ok({ echoed: text, count }),
      )).toThrow("Socket.IO operationId collision: 'EchoMessage' is already registered");
      expect(() => adapter.register(
        echoContract("OtherOperation", first.event),
        ({ text, count }) => Result.ok({ echoed: text, count }),
      )).toThrow("Socket.IO event collision: 'message:echo' is already registered");

      registration.remove();
      const replacement = adapter.register(first, ({ text, count }) => Result.ok({ echoed: text, count }));
      expect(replacement.active).toBe(true);
    } finally {
      await target.close();
    }
  });

  it("aborts an in-flight portable handler when its socket disconnects", async () => {
    const target = await harness();
    let started!: () => void;
    let aborted!: () => void;
    const didStart = new Promise<void>((resolve) => { started = resolve; });
    const didAbort = new Promise<void>((resolve) => { aborted = resolve; });
    try {
      const adapter = adapterFor(target);
      const contract = echoContract();
      adapter.register(contract, (_payload, { signal }) => {
        started();
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted();
            reject(signal.reason);
          }, { once: true });
        });
      });
      const client = await connect(target);
      client.emit(contract.event, { text: "wait", count: 1 }, () => undefined);
      await didStart;

      client.disconnect();

      await aborted;
      expect(client.connected).toBe(false);
    } finally {
      await target.close();
    }
  });

  it("propagates unexpected errors to onError without fabricating an Internal Result", async () => {
    const target = await harness();
    const errors: Array<{ error: unknown; context: SocketAdapterErrorContext }> = [];
    try {
      const adapter = adapterFor(target, errors);
      const contract = echoContract();
      const failure = new Error("database unavailable");
      adapter.register(contract, () => { throw failure; });
      const client = await connect(target);

      await expect(emitAck(client, contract.event, { text: "hello", count: 1 }, 50)).rejects.toThrow();
      expect(errors).toEqual([{
        error: failure,
        context: {
          operationId: contract.operationId,
          event: contract.event,
          socketId: expect.any(String),
        },
      }]);
    } finally {
      await target.close();
    }
  });

  it("requires exactly one acknowledgement and never invokes the handler for invalid arity", async () => {
    const target = await harness();
    let calls = 0;
    try {
      const adapter = adapterFor(target);
      const contract = echoContract();
      adapter.register(contract, ({ text, count }) => {
        calls += 1;
        return Result.ok({ echoed: text, count });
      });
      const client = await connect(target);

      const result = await new Promise<ResultOutcome<never>>((resolve) => {
        client.emit(contract.event, { text: "hello", count: 1 }, "extra", resolve);
      });

      expect(result).toEqual(Result.fail(Errors.validation([{
        field: "payload",
        code: "socketio.payload.arity",
        message: "expected exactly one payload and one acknowledgement callback",
      }])));
      expect(calls).toBe(0);
    } finally {
      await target.close();
    }
  });

  it("removes a registration from existing sockets and releases its listener", async () => {
    const target = await harness();
    try {
      const adapter = adapterFor(target);
      const contract = echoContract();
      const registration = adapter.register(
        contract,
        ({ text, count }) => Result.ok({ echoed: text, count }),
      );
      const client = await connect(target);
      expect(await emitAck(client, contract.event, { text: "before", count: 1 }))
        .toEqual(Result.ok({ echoed: "before", count: 1 }));

      registration.remove();

      expect(registration.active).toBe(false);
      await expect(emitAck(client, contract.event, { text: "after", count: 1 }, 50)).rejects.toThrow();
    } finally {
      await target.close();
    }
  });

  it("removes the whole adapter and makes its installed authentication middleware inert", async () => {
    const target = await harness();
    try {
      const adapter = createSocketIoAdapter(target.io, {
        authentication: accessTokenAuthentication(tokens()),
        onError: () => undefined,
      });
      const contract = echoContract();
      const registration = adapter.register(
        contract,
        ({ text, count }) => Result.ok({ echoed: text, count }),
      );

      adapter.remove();
      adapter.remove();

      expect(registration.active).toBe(false);
      expect(() => adapter.register(
        contract,
        ({ text, count }) => Result.ok({ echoed: text, count }),
      )).toThrow("Cannot register an event on a removed Socket.IO adapter");
      const client = await connect(target, { accessToken: "now-inert" });
      await expect(emitAck(client, contract.event, { text: "after", count: 1 }, 50)).rejects.toThrow();
    } finally {
      await target.close();
    }
  });
});
