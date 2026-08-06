import { InvalidAccessTokenError, type CurrentUser } from "@skiesjs/auth";
import {
  Errors,
  Result,
  type FieldError,
  type Result as ResultOutcome,
} from "@skiesjs/core";
import type { Server, Socket } from "socket.io";
import { encode } from "zod";
import {
  isAccessTokenAuthentication,
  type AccessTokenAuthentication,
} from "./auth.js";
import type {
  SocketAuthPosture,
  SocketEventAuth,
  SocketEventContract,
  SocketEventOutput,
  SocketEventPayload,
  SocketEventWireOutput,
} from "./contract.js";

/** A success or expected-failure acknowledgement on the Socket.IO wire. */
export type SocketAcknowledgement<T> = ResultOutcome<T>;

/** Portable context supplied to a handler without a Socket, request, response, or HTTP global. */
export type SocketEventContext<Auth extends SocketAuthPosture> = Readonly<{
  /** Aborted when the socket disconnects or its registration is removed. */
  signal: AbortSignal;
  /** Verified identity; statically non-optional only for required-auth contracts. */
  currentUser: Auth extends "required" ? CurrentUser : CurrentUser | undefined;
}>;

/** A framework-neutral Result-returning domain handler. */
export type SocketEventHandler<Contract extends SocketEventContract> = (
  payload: SocketEventPayload<Contract>,
  context: SocketEventContext<SocketEventAuth<Contract>>,
) => ResultOutcome<SocketEventOutput<Contract>>
  | Promise<ResultOutcome<SocketEventOutput<Contract>>>;

/** Diagnostic metadata passed to the application's unexpected-error boundary. */
export interface SocketAdapterErrorContext {
  readonly operationId: string;
  readonly event: string;
  readonly socketId: string;
}

/** Options for one explicitly removable adapter. */
export interface SocketIoAdapterOptions {
  /** Explicit AccessTokens-backed connection middleware. Required-auth events cannot register without it. */
  readonly authentication?: AccessTokenAuthentication;
  /** Unexpected handler, encoding, acknowledgement, and protocol errors are propagated here, never as Result failures. */
  readonly onError: (error: unknown, context: SocketAdapterErrorContext) => void;
}

/** One event registration owned by an adapter. */
export interface SocketEventRegistration {
  readonly operationId: string;
  readonly event: string;
  readonly active: boolean;
  /** Remove listeners, abort in-flight handlers, and release both collision keys. Idempotent. */
  remove(): void;
}

/** Explicit registration surface bound to one Socket.IO server. */
export interface SocketIoAdapter {
  /** Register one contract and its portable handler. */
  register<Contract extends SocketEventContract>(
    contract: Contract,
    handler: SocketEventHandler<Contract>,
  ): SocketEventRegistration;
  /** Remove every registration and make the installed authentication middleware inert. Idempotent. */
  remove(): void;
}

type Ack = (result: SocketAcknowledgement<unknown>) => void;
type Listener = (...arguments_: unknown[]) => void;

interface CollisionRegistry {
  readonly operations: Map<string, symbol>;
  readonly events: Map<string, symbol>;
}

interface Binding {
  readonly listener: Listener;
  readonly disconnect: () => void;
  readonly controllers: Set<AbortController>;
}

const registries = new WeakMap<Server, CollisionRegistry>();

function registryFor(server: Server): CollisionRegistry {
  const existing = registries.get(server);
  if (existing !== undefined) return existing;
  const created = { operations: new Map<string, symbol>(), events: new Map<string, symbol>() };
  registries.set(server, created);
  return created;
}

function claim(server: Server, contract: SocketEventContract): { owner: symbol; release: () => void } {
  const registry = registryFor(server);
  if (registry.operations.has(contract.operationId)) {
    throw new Error(`Socket.IO operationId collision: '${contract.operationId}' is already registered`);
  }
  if (registry.events.has(contract.event)) {
    throw new Error(`Socket.IO event collision: '${contract.event}' is already registered`);
  }
  const owner = Symbol(contract.operationId);
  registry.operations.set(contract.operationId, owner);
  registry.events.set(contract.event, owner);
  return {
    owner,
    release: () => {
      if (registry.operations.get(contract.operationId) === owner) {
        registry.operations.delete(contract.operationId);
      }
      if (registry.events.get(contract.event) === owner) registry.events.delete(contract.event);
    },
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fieldError(issue: {
  readonly code: string;
  readonly message: string;
  readonly path: readonly PropertyKey[];
  readonly params?: Readonly<Record<string, unknown>> | undefined;
}): FieldError {
  const suffix = issue.path.map(String).join(".");
  return {
    field: suffix.length === 0 ? "payload" : `payload.${suffix}`,
    code: typeof issue.params?.["skiesCode"] === "string"
      ? issue.params["skiesCode"]
      : `validation.${issue.code}`,
    message: issue.message,
  };
}

function validatePayload(contract: SocketEventContract, payload: unknown): ResultOutcome<unknown> {
  const parsed = contract.payload.safeParse(payload);
  if (parsed.success) return Result.ok(parsed.data);
  const fields = parsed.error.issues.map((issue) => fieldError(issue));
  fields.sort((left, right) => compareText(left.field, right.field)
    || compareText(left.code, right.code)
    || compareText(left.message, right.message));
  return Result.fail(Errors.validation(fields));
}

function arityFailure(): ResultOutcome<never> {
  return Result.fail(Errors.validation([{
    field: "payload",
    code: "socketio.payload.arity",
    message: "expected exactly one payload and one acknowledgement callback",
  }]));
}

function abortReason(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

function isCancellation(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted && (error === signal.reason
    || (error instanceof DOMException && error.name === "AbortError"));
}

function once(acknowledge: Ack): Ack {
  let called = false;
  return (result) => {
    if (called) return;
    called = true;
    acknowledge(result);
  };
}

/** Create an adapter. Registration stays visible in application composition code and nothing is discovered. */
export function createSocketIoAdapter(
  server: Server,
  options: SocketIoAdapterOptions,
): SocketIoAdapter {
  if (server === null || typeof server !== "object" || typeof server.on !== "function") {
    throw new TypeError("server must be a Socket.IO Server");
  }
  if (options === null || typeof options !== "object" || typeof options.onError !== "function") {
    throw new TypeError("options.onError must be a function");
  }
  if (options.authentication !== undefined
    && !isAccessTokenAuthentication(options.authentication)) {
    throw new TypeError("authentication must come from accessTokenAuthentication()");
  }

  let active = true;
  const registrations = new Set<SocketEventRegistration>();
  const authentication = options.authentication;
  if (authentication !== undefined) {
    server.use((socket, next) => {
      if (!active) {
        next();
        return;
      }
      void authentication.middleware(socket, next);
    });
  }

  const register = <Contract extends SocketEventContract>(
    contract: Contract,
    handler: SocketEventHandler<Contract>,
  ): SocketEventRegistration => {
    if (!active) throw new Error("Cannot register an event on a removed Socket.IO adapter");
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    if (contract.auth === "required" && authentication === undefined) {
      throw new Error(`${contract.operationId} requires explicit AccessTokens authentication middleware`);
    }

    const { release } = claim(server, contract);
    const bindings = new Map<Socket, Binding>();
    let registrationActive = true;

    const report = (error: unknown, socket: Socket): void => {
      try {
        options.onError(error, {
          operationId: contract.operationId,
          event: contract.event,
          socketId: socket.id,
        });
      } catch (reportingError) {
        queueMicrotask(() => { throw reportingError; });
      }
    };

    const bind = (socket: Socket): void => {
      if (!registrationActive || bindings.has(socket)) return;
      const controllers = new Set<AbortController>();
      const disconnect = (): void => {
        for (const controller of controllers) {
          controller.abort(abortReason("Socket disconnected"));
        }
        bindings.delete(socket);
      };

      const invoke = async (payload: unknown, acknowledge: Ack): Promise<void> => {
        const controller = new AbortController();
        controllers.add(controller);
        if (!socket.connected) controller.abort(abortReason("Socket disconnected"));
        try {
          const currentUser = authentication?.currentUser(socket);
          if (contract.auth === "required" && currentUser === undefined) {
            acknowledge(Result.fail(InvalidAccessTokenError));
            return;
          }
          const validated = validatePayload(contract, payload);
          if (!validated.ok) {
            acknowledge(Result.fail(validated.error));
            return;
          }
          const result = await handler(
            validated.value as SocketEventPayload<Contract>,
            { signal: controller.signal, currentUser } as SocketEventContext<SocketEventAuth<Contract>>,
          );
          if (controller.signal.aborted || !socket.connected) return;
          if (result.ok) {
            const encoded = encode(contract.output, result.value) as SocketEventWireOutput<Contract>;
            acknowledge(Result.ok(encoded));
          } else {
            acknowledge(Result.fail(result.error));
          }
        } catch (caught) {
          if (!isCancellation(caught, controller.signal)) report(caught, socket);
        } finally {
          controllers.delete(controller);
        }
      };

      const listener: Listener = (...arguments_) => {
        const possibleAck = arguments_.at(-1);
        if (typeof possibleAck !== "function") {
          report(new TypeError("Socket.IO contract events require an acknowledgement callback"), socket);
          return;
        }
        const acknowledge = once(possibleAck as Ack);
        if (arguments_.length !== 2) {
          acknowledge(arityFailure());
          return;
        }
        void invoke(arguments_[0], acknowledge);
      };

      bindings.set(socket, { listener, disconnect, controllers });
      socket.on(contract.event, listener);
      socket.once("disconnect", disconnect);
    };

    const connection = (socket: Socket): void => bind(socket);
    server.on("connection", connection);
    for (const socket of server.sockets.sockets.values()) bind(socket);

    let registration!: SocketEventRegistration;
    const remove = (): void => {
      if (!registrationActive) return;
      registrationActive = false;
      server.off("connection", connection);
      for (const [socket, binding] of bindings) {
        socket.off(contract.event, binding.listener);
        socket.off("disconnect", binding.disconnect);
        for (const controller of binding.controllers) {
          controller.abort(abortReason("Socket event registration removed"));
        }
      }
      bindings.clear();
      release();
      registrations.delete(registration);
    };
    registration = Object.freeze({
      operationId: contract.operationId,
      event: contract.event,
      get active() { return registrationActive; },
      remove,
    });
    registrations.add(registration);
    return registration;
  };

  return Object.freeze({
    register,
    remove: () => {
      if (!active) return;
      active = false;
      for (const registration of [...registrations]) registration.remove();
    },
  });
}
