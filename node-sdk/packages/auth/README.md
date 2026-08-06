# @skiesjs/auth

Framework-neutral HS256 access-token issuing and verification for Skies Node.js applications. Tokens carry the
required `sub`, `org`, and `sid` UUID claims and expire 15 minutes after issuance. Verification pins the configured
key, issuer, audience, HS256 algorithm, expiration/not-before checks, and a 30-second clock tolerance.

```ts
import { AccessTokens, type Clock, type CurrentUser } from "@skiesjs/auth";

const clock: Clock = { now: () => new Date() };
const accessTokens = new AccessTokens(
  process.env.JWT_SECRET!,
  "myapp",
  "myapp-api",
  clock,
);

const jwt = await accessTokens.issue(
  "11111111-1111-4111-8111-111111111111", // user id (`sub`)
  "22222222-2222-4222-8222-222222222222", // organization (`org`)
  "admin",
  "33333333-3333-4333-8333-333333333333", // session/refresh family (`sid`)
  "Ada",
);

const result = await accessTokens.verify(jwt);
if (result.ok) {
  const currentUser: CurrentUser = result.value;
  console.log(currentUser.userId, currentUser.role);
} else {
  // Every untrusted-token failure is the stable Unauthorized SkiesError:
  // { kind: "Unauthorized", code: "auth.invalid_access_token", message: "invalid access token" }
  console.log(result.error);
}
```

Pass `null`, `undefined`, an empty string, or whitespace for `role`/`name` to omit that claim. Verification maps
absent or blank optional claims back to `null`. The system clock is the constructor default, while injecting a
`Clock` makes issue and verification times deterministic without decorators or a DI container.
