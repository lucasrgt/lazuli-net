# @skiesjs/socketio

Explicit Socket.IO contracts and registration for Result-returning Skies handlers. The adapter is opt-in,
uses plain TypeScript objects and functions, and has no decorators, discovery, DI container, or base class.

## Install

```bash
npm install @skiesjs/socketio socket.io zod
```

`socket.io` is a peer dependency (`^4.8.3`). The package runs on Node.js 24 or newer and is strict
NodeNext ESM.

## Define and register an event

```ts
import { createServer } from "node:http";
import { AccessTokens } from "@skiesjs/auth";
import { Result } from "@skiesjs/core";
import {
  accessTokenAuthentication,
  createSocketIoAdapter,
  defineSocketEvent,
} from "@skiesjs/socketio";
import { Server } from "socket.io";
import { z } from "zod";

const updateWallet = defineSocketEvent({
  operationId: "UpdateWallet",
  event: "wallet:update",
  auth: "required",
  payload: z.object({ walletId: z.string().uuid(), label: z.string().trim().min(1) }),
  output: z.object({ walletId: z.string().uuid(), label: z.string() }),
});

const http = createServer();
const io = new Server(http);
const accessTokens = new AccessTokens(process.env.JWT_SECRET!, "my-app", "my-app-api");
const adapter = createSocketIoAdapter(io, {
  authentication: accessTokenAuthentication(accessTokens),
  onError: (error, context) => logger.error({ error, ...context }),
});

const registration = adapter.register(updateWallet, async (input, { currentUser, signal }) => {
  // input is Zod-decoded, currentUser is non-optional, and no Socket.IO or HTTP object enters the domain.
  return updateWalletLabel(input, currentUser, signal); // Result<{ walletId: string; label: string }>
});
```

Registration is explicit and rejects duplicate `operationId` or `event` values on the same Socket.IO
server. Both identifiers are released by `registration.remove()`. `adapter.remove()` removes all event
listeners, aborts in-flight handlers, releases collision keys, and makes the installed authentication
middleware inert. Both removal methods are idempotent; neither closes the application-owned server.

## Authentication

Every contract declares `auth: "optional" | "required"`. Authentication is not inferred from a marker:
a required contract cannot register unless the adapter receives
`accessTokenAuthentication(accessTokens)`. That factory installs real Socket.IO connection middleware
which verifies a provided JWT with `AccessTokens.verify`.

Clients send the raw token in the handshake:

```ts
import { io } from "socket.io-client";

const socket = io(url, { auth: { accessToken } });
```

A missing token keeps the connection anonymous so optional and required events can share a namespace.
An optional handler receives `CurrentUser | undefined`; a required handler receives `CurrentUser` and a
missing identity is acknowledged with the canonical `auth.invalid_access_token` failure before payload
validation. A credential that is present but blank, malformed, expired, or invalid rejects the handshake;
`connect_error.data` is the same failure envelope. Identity lives only in the authentication boundary and
handler context—never in request/response globals.

## Payload and acknowledgement contract

Each event accepts exactly one payload and one acknowledgement callback. Zod 4 parses the inbound value;
issues become `Errors.validation(...)` field failures such as `payload.walletId` and
`validation.invalid_format`. A custom Zod issue can supply `params.skiesCode` to override the default code.
Fields are sorted for a deterministic wire response.

Handlers return `Result<T>` (or a promise of one). The acknowledgement preserves that discriminated union:

```ts
// success
{ ok: true, value: { walletId: "...", label: "Primary" } }

// expected or validation failure
{
  ok: false,
  error: {
    kind: "Validation",
    code: "validation.failed",
    message: "Validation failed",
    fields: [{ field: "payload.label", code: "validation.too_small", message: "..." }]
  }
}
```

Successful values are validated and encoded through the contract's output schema, including Zod codecs.
The adapter owns the acknowledgement and wraps it as once-only, so domain handlers cannot double-send.
Events without an acknowledgement are reported to `onError`; extra arguments receive a canonical arity
validation failure.

## Errors, disconnects, and ownership

Expected domain failures stay in `Result.fail`. Unexpected handler throws, invalid success output,
transport acknowledgement failures, and protocol errors are passed to the required `onError` boundary
with only `operationId`, `event`, and `socketId`; they are not mislabeled as expected `Internal` results.

Every invocation receives its own `AbortSignal`. A socket disconnect or explicit removal aborts all of that
registration's in-flight handlers. Completion after disconnect is never acknowledged. Throwing the
signal's `AbortError` is treated as cancellation; other unexpected errors still reach `onError`.

The application owns the HTTP server and Socket.IO `Server`. Removing this adapter does not close either.
