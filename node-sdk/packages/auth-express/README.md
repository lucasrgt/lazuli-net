# @skiesjs/auth-express

Express 5 authentication boundaries for `@skiesjs/auth`: explicit JWT middleware for protected slices and one
secure refresh-cookie convention for web clients. Token verification stays in `@skiesjs/auth`; canonical error
rendering stays in `@skiesjs/express`.

## Protect a slice

Create the middleware once from the same `AccessTokens` boundary used to issue access tokens, then pass it visibly as
`mapSlice`'s `authorize` middleware. Successful verification writes a typed `CurrentUser` to `res.locals`; missing,
malformed, invalid, and expired credentials stop at the canonical 401 response.

```ts
import { AccessTokens } from "@skiesjs/auth";
import { currentUser, requireJwt, type AuthenticatedLocals } from "@skiesjs/auth-express";
import { mapSlice } from "@skiesjs/express";

const accessTokens = new AccessTokens(secret, "myapp", "myapp-api");
const authorize = requireJwt(accessTokens);

mapSlice(router, openApi, contract, {
  authorize,
  toInput: ({ params }) => ({ walletId: params.walletId }),
  handle,
});

// In ordinary downstream Express middleware, currentUser(res) returns CurrentUser and throws
// if requireJwt was accidentally omitted or registered after the handler.
router.get("/me", authorize, (_req, res) => res.json(currentUser(res)));
```

`AuthenticatedLocals` is available when an application wants to annotate its own Express handler generics directly.
The `currentUser(res)` accessor is usually simpler and keeps the middleware-order guard at runtime.

## Deliver refresh tokens

`RefreshCookie` defaults to a host-only, `SameSite=Strict`, `/` cookie. `HttpOnly` is always set. `Secure` is omitted
only on plain HTTP for `localhost`, `127.0.0.1`, or `[::1]`; HTTPS and every non-loopback host remain Secure, including
an HTTP hop behind TLS termination.

```ts
import { RefreshCookie } from "@skiesjs/auth-express";

const refresh = new RefreshCookie({
  name: "myapp_refresh",
  path: "/account",
  // domain: ".example.com", // opt in only when sibling subdomains must share it
  // sameSite: "lax",
});

if (refresh.isWeb(req)) {
  refresh.setRefresh(req, res, token, expires);
}

const presentedToken = refresh.refreshFrom(req, req.body.refreshToken);
refresh.clear(res);
```

`isWeb` recognizes only the case-insensitive exact `X-Client: web` value. Reading is intentionally independent of that
header: any nonempty named cookie wins, otherwise `refreshFrom` returns the supplied body token or `""`. Both setting
and clearing append rather than replace existing `Set-Cookie` headers, and clearing reuses the configured path/domain.
