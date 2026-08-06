export function hubSource(
  moduleName: string,
  name: string,
  event: string,
  criterion: string,
): string {
  return `import { Result } from "@skiesjs/core";
import {
  defineSocketEvent,
  type SocketEventContext,
  type SocketEventRegistration,
  type SocketIoAdapter,
} from "@skiesjs/socketio";
import { z } from "zod";

// @skies-criterion ${criterion}
export const contract = defineSocketEvent({
  operationId: ${JSON.stringify(`${moduleName}${name}`)},
  event: ${JSON.stringify(event)},
  auth: "optional",
  payload: z.object({ message: z.string().trim().min(1) }),
  output: z.object({ accepted: z.literal(true), message: z.string() }),
});

export type Input = { readonly message: string };
export interface Output { readonly accepted: true; readonly message: string }

export async function handle(
  input: Input,
  _context: SocketEventContext<"optional">,
): Promise<Result<Output>> {
  return Result.ok({ accepted: true, message: input.message });
}

/** The composition root calls this explicitly with its ordinary Socket.IO adapter. */
export function map(adapter: SocketIoAdapter): SocketEventRegistration {
  return adapter.register(contract, handle);
}
`;
}

export function hubTestSource(name: string, fileBase: string, criterion: string): string {
  return `import { expect } from "vitest";
import { unit } from "@skiesjs/testing";
import * as ${name} from "./${fileBase}.hub.js";

// @skies-proof ${criterion}
unit("defines and executes the explicit Socket.IO acknowledgement contract", async () => {
  expect(${name}.contract.payload.safeParse({ message: "" }).success).toBe(false);
  const result = await ${name}.handle(
    { message: "ready" },
    { signal: new AbortController().signal, currentUser: undefined },
  );
  expect(result).toEqual({ ok: true, value: { accepted: true, message: "ready" } });
});
`;
}
