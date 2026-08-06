# @skiesjs/cli

Transactional, explicit scaffolding for plain NodeNext TypeScript Skies applications. The binary is `skies-node`,
avoiding the .NET `skies` global tool and the unrelated npm package named `skies`.

## Start an application

```bash
skies-node new invoices-api
cd invoices-api
npm install
npm run check
npm run build
npm start
```

Use `skies-node new . --name invoices-api` to populate the current directory, or
`skies-node new invoices-api --cwd ../services`. The starter contains:

- a private package manifest and self-contained NodeNext build/test TypeScript configs;
- the recommended `eslint-plugin-skies-node` flat config and a bounded Vitest config whose `SkiesProofReporter`
  requires proof metadata and writes `.skies/foundation/vitest-receipt.json`;
- explicit Express/OpenAPI composition in `src/app.ts` and runnable `src/server.ts` startup;
- `src/modules.ts` plus a registered Health module, context, contract-backed slice, and co-located proof;
- `lint`, `typecheck`, `test`, `doctor`, `build`, `check`, and `start` scripts.

The generated application exposes `GET /health` and `GET /openapi/v1.json`. It has no decorators, discovery,
dependency injection container, or generated runtime behavior.

## Generate application code

Run these inside an application. PascalCase arguments become predictable kebab-case filenames.

```bash
# Structural generators
skies-node g module Billing
skies-node g context Billing
skies-node g slice Billing CreateInvoice --method post --route /invoices
skies-node g entity Billing Invoice
skies-node g crud Billing Invoice
skies-node g hub Billing InvoiceUpdates

# Domain and boundary generators
skies-node g error-code Billing InvoiceNotFound
skies-node g error-code Billing InvoiceNotFound --code billing.invoice_not_found
skies-node g value-object Billing InvoiceId
skies-node g page Billing Invoice
skies-node g storage
skies-node g storage --directory .data/files --base-url http://localhost:3000/files --route /files
skies-node g auth --issuer invoices --audience invoices-api
skies-node g auth:otp
skies-node g auth:oauth
skies-node g auth:email
```

All `g` commands accept `--cwd <application>`, `--root <source-root>` (default `src`), and `--dry-run`.
Routes use OpenAPI syntax such as `/invoices/{invoiceId}` rather than Express `:invoiceId` syntax.

### What each generator writes

- `g module` creates `src/modules/billing/billing.module.ts` and `billing.ctx.md`, then adds one namespace import
  and direct `Billing.map(...)` call to `src/modules.ts`. A current two-argument registry produces Router/OpenAPI wiring;
  the legacy one-argument registry shape remains supported.
- `g context` creates only the missing module context.
- `g slice` creates `slices/create-invoice.slice.ts` and its exact sibling test. The slice owns a local
  `defineContract`, explicit `auth: "anonymous"`, `kind: "app"`, Zod success schema, `mapSlice`, stable criterion,
  runnable `Result`, and proof. When the owning module uses the current Router/OpenAPI template, the same transaction
  adds its explicit import and map call so the workspace doctor stays green.
- `g error-code` creates `billing.errors.ts` with a `defineErrorCodes` registry member and a visible
  `Errors.businessRule` factory that consumes it. Change the explicit Errors factory when another canonical error
  category is appropriate. The default wire code is `billing.invoice_not_found`.
- `g value-object` creates `values/invoice-id.errors.ts`, `invoice-id.ts`, and `invoice-id.test.ts`. Its smart
  constructor is authoritative; `scalarCodec` and `scalarSchema` expose the same string rule to domain and Zod/OpenAPI
  boundaries. Replace the scaffold rule and primitive metadata with the real invariant.
- `g page` creates `pages/invoice.page.ts` and its test, using core `Page`/`mapPage` plus an explicit Zod wire schema.
- `g entity` creates an explicit Drizzle PostgreSQL `pgTable`, UUID primary key, organization owner, integer
  optimistic-concurrency version, timestamps, SQL migration, and executable table-shape test.
- `g crud` is one transaction: it reuses or creates that entity, then writes entity-specific Create/Get/List/Update/Delete
  `defineContract`/`mapSlice` files, exact sibling tests and write journeys, a stable error registry and UUID scalar codec,
  concrete Drizzle queries using `pagePolicy`/`toPage`/`executeVersionedMutation`, visible module dependency wiring, and
  manifest criteria/proofs. It never creates a generic repository.
- `g hub` creates an explicit Socket.IO `defineSocketEvent` contract and `SocketIoAdapter.register` map. These are the
  actual `@skiesjs/socketio` API names (the package does not export `defineSocketContract` or `mapSocket`).
- `g storage` creates `src/wiring/storage.ts` and its test. `LocalFileStorage` construction and
  `mapLocalFiles(app, files, ...)` remain visible and removable.
- `g auth` creates `src/wiring/auth.ts` and its test. The caller must supply the signing secret at runtime; the
  generated `AccessTokens` and `requireJwt` relationship is explicit.
- `g auth:otp`, `g auth:oauth`, and `g auth:email` require `g auth` first and refuse overwrites. They add focused
  provider-agnostic ports, digest-only or sealed state, stable errors, explicit expiry and atomic replay behavior,
  contract maps, and executable happy/sad proofs. No provider SDK or raw persisted OTP/code/link secret is generated.

The application needs the focused packages imported by a selected generator (`@skiesjs/core`, `@skiesjs/openapi`,
`@skiesjs/express`, `@skiesjs/testing`, Drizzle/PostgreSQL, Socket.IO, and, where relevant, the auth or storage
packages). `new` declares all of these so later generators typecheck without a manifest rewrite.

## Transaction guarantees

Every command builds one `FilePlan`, validates every target before writing, and then applies it as an all-or-nothing
transaction. Plans reject normalized duplicates, traversal outside the application root, symlink escapes, unexpected
replacements, and every create collision. Replacements require byte-exact expected contents. A failure during staging
or rename rolls back created files, restored files, temporary files, backups, and newly empty directories.

`--dry-run` performs the same containment, symlink, structure, and collision preflight and prints the deterministic
ordered targets without writing. Generators deliberately refuse rerun overwrites; an identical second invocation fails
cleanly and leaves authored files byte-for-byte unchanged.
