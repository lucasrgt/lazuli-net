# @skiesjs/identity

A vendor-neutral asynchronous port for verifying external OIDC identity tokens, plus a development fake. Provider
SDK integrations stay in separate packages and implement `ExternalIdentity`.

```ts
import { FakeExternalIdentity, type ExternalIdentity } from "@skiesjs/identity";

const identity: ExternalIdentity = new FakeExternalIdentity();
const result = await identity.verify(idToken, signal);
```

`FakeExternalIdentity` treats a nonblank token as both the subject and verified email and identifies the provider as
`fake`. Blank tokens return the canonical `identity.invalid_token` unauthorized result from `@skiesjs/core`.
