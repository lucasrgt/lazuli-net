# @skiesjs/rate-limit-express

Explicit Express 5 rate limiting that renders rejected requests through the Skies HTTP error contract.
It uses the maintained [`express-rate-limit`](https://www.npmjs.com/package/express-rate-limit) store ecosystem,
but owns the public rejection shape: HTTP 429, the canonical `RateLimit` envelope, `Retry-After`, and draft-8
`RateLimit` headers. Legacy `X-RateLimit-*` headers are disabled.

## Install

```bash
npm install @skiesjs/core @skiesjs/express @skiesjs/rate-limit-express express
```

## Use

Register each policy explicitly where Express should apply it:

```ts
import express from "express";
import { createRateLimiter } from "@skiesjs/rate-limit-express";

const app = express();

app.use("/api", createRateLimiter({
  windowMs: 60_000,
  limit: 100,
}));
```

The default rejection is:

```json
{
  "error": "RateLimit",
  "code": "platform.rate_limited",
  "message": "Too many requests. Please slow down.",
  "fields": null
}
```

Customize only the stable client contract when the application owns a different registry code:

```ts
app.use("/sign-in", createRateLimiter({
  windowMs: 15 * 60_000,
  limit: 5,
  code: "identity.sign_in_rate_limited",
  message: "Too many sign-in attempts. Please try again later.",
}));
```

By default, clients are partitioned by the safe IPv4/IPv6 strategy from `express-rate-limit`; no authentication
middleware or request property is assumed. An application can supply an explicit key strategy and any compatible
store, including a shared production store:

```ts
import type { Store } from "@skiesjs/rate-limit-express";

const store: Store = createSharedRateLimitStore();

app.use(createRateLimiter({
  windowMs: 60_000,
  limit: 20,
  store,
  keyGenerator: (request) => request.get("x-api-client") ?? request.ip,
}));
```

A store should return its actual `resetTime` so `Retry-After` and the standard rate-limit headers describe the
remaining window precisely. Counter failures are fail-closed: they are forwarded to the normal Express error
pipeline instead of allowing an uncounted request through. Place the application's error middleware after the
limiter and routes.
