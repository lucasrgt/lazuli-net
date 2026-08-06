import type { input, output, ZodType } from "zod";

/** Authentication posture declared by every Socket.IO event contract. */
export type SocketAuthPosture = "optional" | "required";

/**
 * Plain runtime metadata for one Socket.IO request/ack exchange. Stable identifiers and Zod schemas
 * remain explicit so registration never depends on decorators, reflection, or discovery.
 */
export interface SocketEventContract<
  Payload extends ZodType = ZodType,
  Output extends ZodType = ZodType,
  Auth extends SocketAuthPosture = SocketAuthPosture,
> {
  /** Stable application operation identifier used for diagnostics and collision detection. */
  readonly operationId: string;
  /** Exact Socket.IO event name used on the wire and for collision detection. */
  readonly event: string;
  /** Whether a verified current user is optional or required. */
  readonly auth: Auth;
  /** Schema that validates and decodes the single inbound payload. */
  readonly payload: Payload;
  /** Schema that validates and encodes a successful handler value for the acknowledgement. */
  readonly output: Output;
}

/** The decoded payload delivered to a contract's handler. */
export type SocketEventPayload<Contract extends SocketEventContract> =
  Contract extends SocketEventContract<infer Payload, ZodType, SocketAuthPosture>
    ? output<Payload>
    : never;

/** The domain success value returned by a contract's handler. */
export type SocketEventOutput<Contract extends SocketEventContract> =
  Contract extends SocketEventContract<ZodType, infer Output, SocketAuthPosture>
    ? output<Output>
    : never;

/** The encoded success value sent over the Socket.IO acknowledgement. */
export type SocketEventWireOutput<Contract extends SocketEventContract> =
  Contract extends SocketEventContract<ZodType, infer Output, SocketAuthPosture>
    ? input<Output>
    : never;

/** The authentication posture retained by a contract. */
export type SocketEventAuth<Contract extends SocketEventContract> =
  Contract extends SocketEventContract<ZodType, ZodType, infer Auth> ? Auth : never;

const RESERVED_EVENTS = new Set([
  "connect",
  "connect_error",
  "disconnect",
  "disconnecting",
  "newListener",
  "removeListener",
]);

function assertSchema(value: ZodType, name: string): void {
  if (typeof value !== "object" || value === null || !("safeParse" in value)) {
    throw new TypeError(`${name} must be a Zod schema`);
  }
}

/** Identity helper that validates metadata while preserving exact Zod and auth types. */
export function defineSocketEvent<
  const Payload extends ZodType,
  const Output extends ZodType,
  const Auth extends SocketAuthPosture,
>(
  contract: SocketEventContract<Payload, Output, Auth>,
): SocketEventContract<Payload, Output, Auth> {
  if (typeof contract.operationId !== "string" || contract.operationId.trim().length === 0) {
    throw new TypeError("operationId must not be blank");
  }
  if (typeof contract.event !== "string" || contract.event.trim().length === 0) {
    throw new TypeError("event must not be blank");
  }
  if (RESERVED_EVENTS.has(contract.event)) {
    throw new TypeError(`event '${contract.event}' is reserved by Socket.IO`);
  }
  if (contract.auth !== "optional" && contract.auth !== "required") {
    throw new TypeError("auth must explicitly be 'optional' or 'required'");
  }
  assertSchema(contract.payload, "payload");
  assertSchema(contract.output, "output");
  return Object.freeze({ ...contract });
}
