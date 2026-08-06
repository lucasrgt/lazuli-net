# @skiesjs/testing-postgres

Fast, real-PostgreSQL isolation for Node.js integration tests. One PostgreSQL 17 Testcontainers server starts lazily,
one template is migrated, and every unkeyed store is a physical `CREATE DATABASE ... TEMPLATE` clone. A keyed store
is reference-counted so multiple request contexts can deliberately share one clone.

```ts
import { PostgresTestHarness } from "@skiesjs/testing-postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const databases = new PostgresTestHarness({
  migrateTemplate: async ({ sql, signal }) => {
    signal.throwIfAborted();
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    signal.throwIfAborted();
  },
});

const store = await databases.createStore();
const db = drizzle(store.sql);
try {
  // Run one test against db.
} finally {
  await store.dispose();
}
await databases.dispose();
```

`createStore({ key: "checkout journey" })` shares one database among every live lease for that exact key. The first
lease creates it and the last disposal drops it. Omitting `key` always creates an isolated clone. Both stores and
the whole harness support asynchronous, idempotent `dispose()` and `await using` on Node.js 24.

The default runtime uses the modular `@testcontainers/postgresql` package with `postgres`, the
`postgres:17-alpine` image, and test-only durability settings (`fsync`, synchronous commit, and full-page writes
off). Setup and clone SQL are serialized, canceled after 300 seconds, and never retried: a client timeout does not
prove a server-side `CREATE DATABASE` failed. Templates and clones receive generated internal names, are always
identifier-quoted, and stale Skies templates/clones are force-dropped before migration. Connection URLs retain
encoded credentials and options while replacing the database with an encoded path segment. Administration and
template pools use one connection; clone pools use at most four and prune idle connections after one second.

The migration callback must use the supplied `sql` client, propagate its signal where supported, and return only
after migrations finish. The harness closes that client before cloning. Application schemas and migration files
remain application-owned.

## Docker integration proof

Unit tests inject the exported `PostgresTestRuntime` seam and need no Docker. The real isolation/ref-count proof is
intentionally opt-in so an ordinary unit run never starts containers:

```bash
SKIES_TEST_POSTGRES=1 npm run test:integration --workspace @skiesjs/testing-postgres
```

The CI integration lane must set `SKIES_TEST_POSTGRES=1`; invoking the file without that explicit opt-in reports the
Docker suite as skipped.
