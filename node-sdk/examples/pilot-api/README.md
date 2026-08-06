# Skies wallet pilot API

A nontrivial, independently runnable Skies example built from plain strict NodeNext TypeScript and Express 5. There are
no decorators, controller base classes, service containers, discovery scans, or generic repositories. All local
Skies packages are pinned to `0.1.0`.

## What is composed

`src/app.ts` is the HTTP composition root. It constructs the live OpenAPI registry, explicitly maps the
`LocalFileStorage` HTTP adapter, calls `mapModules`, and maps both full and app-client OpenAPI documents.
`src/modules.ts` namespace-imports the Wallets bounded context and calls its synchronous `map`. Finally,
`wallets.module.ts` registers its error-code registry and calls every slice's `map` directly.

The visible operations are:

| Method and path | operationId | Auth | Audience |
| --- | --- | --- | --- |
| `GET /health` | `Wallets.Health` | anonymous | internal |
| `POST /wallets/token` | `Wallets.IssuePilotToken` | anonymous | app |
| `GET /wallets` | `Wallets.List` | Bearer JWT | app |
| `GET /openapi/v1.json` | live service document | anonymous | infrastructure |
| `GET /openapi/app-v1.json` | live app projection | anonymous | infrastructure |
| `PUT/GET /files/{key}` | local storage adapter, including ranges | anonymous | asset infrastructure |

The token issuer is intentionally a pilot bootstrap operation, not an account login design. Replace it with the
application's identity flow before deploying a real service.

## Requirements and configuration

Use Node.js 24 or newer. Node 22 can execute the current workspace for evaluation but npm will correctly emit an
engine warning; if that warning must be tolerated in a Node 22-only CI job, set `npm_config_engine_strict=false` for
the command. The `node >=24` engine declaration must remain unchanged.

Create the table with `database/schema.sql`, then export:

```sh
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/skies_pilot'
export JWT_SECRET='replace-with-a-long-random-secret'
export JWT_ISSUER='skies-wallet-pilot'          # optional default shown
export JWT_AUDIENCE='skies-wallet-pilot-api'   # optional default shown
export PORT='3000'                              # optional, defaults to 3000
# export STORAGE_ROOT='/absolute/persistent/path' # optional
```

When `STORAGE_ROOT` is absent, startup creates a mode-0700 directory under the operating system's temporary directory
and removes it on graceful shutdown. A configured root must be absolute. The local file routes are mapped before the
JSON parser so uploads stream instead of being buffered.

From `node-sdk` after the workspace dependencies have been installed and built:

```sh
npm run build --workspace @skiesjs/pilot-api
npm run start --workspace @skiesjs/pilot-api
```

A direct package invocation works as well:

```sh
cd examples/pilot-api
npm run build
npm start
```

## PostgreSQL paging

`wallet.queries.ts` owns the real postgres-js/Drizzle composition. Its count and select callbacks close over the same
`archived = false` filter, and the selection visibly orders by `created_at` followed by the unique `id` tie-breaker
before applying `limit` and `offset`. `@skiesjs/drizzle-postgres` `toPage` clamps and projects that query. Tests replace
only the narrow `ListWallets` callback at the explicit composition seam; no repository abstraction is introduced.

## Try the API

Issue a deterministic-shape access token (the token time itself uses the production clock):

```sh
TOKEN=$(curl -s http://localhost:3000/wallets/token   -H 'content-type: application/json'   -d '{"userId":"11111111-1111-4111-8111-111111111111","orgId":"22222222-2222-4222-8222-222222222222","sessionId":"33333333-3333-4333-8333-333333333333","role":"reader","name":"Ada"}'   | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')

curl -H "Authorization: Bearer $TOKEN" 'http://localhost:3000/wallets?pageNumber=1&pageSize=20'
curl -X PUT --data-binary '0123456789' -H 'content-type: text/plain'   http://localhost:3000/files/statements/example.txt
curl -H 'range: bytes=2-5' http://localhost:3000/files/statements/example.txt
```

## Proofs and gates

Tests stay beside source and use the `@skiesjs/testing` `unit`, `integration`, `e2e`, and `journey` wrappers. They prove
the branded UUID codec, callback paging seam, injected-clock token issue/use journey, stable unauthenticated 401,
local upload/range download, and live OpenAPI schemas. The OpenAPI proof checks stable operation IDs, all nine canonical
error responses, bearer security, registered error codes, and exclusion of the internal health operation from the app
projection.

```sh
npm run lint
npm run typecheck
npm run doctor
npm test
npm run build
npm run check
```

`npm run check` is the maintainer gate and runs the recommended Skies ESLint configuration, strict type checking, the
Skies doctor, Vitest, and the production compile in that order.
