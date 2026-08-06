# @skiesjs/drizzle-postgres

The narrow official Drizzle/PostgreSQL adapter. It does not hide Drizzle, construct a database, or pretend other ORMs
share its query model. Applications retain their schema, filters, transactions, migrations, locking, and pools.

## Bounded ordered pages

Declare one reviewable policy beside the actual query. The same frozen policy object reaches count and selection,
page bounds are clamped before materialization, and the final order column must be marked database-unique.

```ts
const policy = pagePolicy({
  owner: "wallets",
  filter: "wallets.active_for_org",
  order: [
    { column: "createdAt", direction: "asc" },
    { column: "id", direction: "asc", unique: true },
  ],
});
const visible = and(eq(wallets.orgId, orgId), eq(wallets.archived, false));
const page = await toPage({
  pageNumber: input.pageNumber, pageSize: input.pageSize, maxPageSize: 100, policy, signal,
  count: async ({ signal: querySignal, policy: received }) => {
    querySignal?.throwIfAborted();
    if (received !== policy) throw new Error("page policy changed");
    return db.$count(wallets, visible);
  },
  select: async ({ offset, limit, signal: querySignal, policy: received }) => {
    querySignal?.throwIfAborted();
    if (received !== policy) throw new Error("page policy changed");
    return db.select().from(wallets).where(visible)
      .orderBy(asc(wallets.createdAt), asc(wallets.id)).limit(limit).offset(offset);
  },
  project: (wallet) => ({ id: wallet.id, name: wallet.name }),
});
```

The Docker integration proof runs this convention against PostgreSQL 17 and proves tenant filtering, count/selection
agreement, clamping, and a unique tie-break for equal timestamps.

## Writes and raw SQL

`executeVersionedMutation` passes a required non-negative expected version to application Drizzle code. The callback
must put it in the update/delete predicate and return the driver's affected-row count: zero becomes a stable
`Conflict`, one succeeds, and fan-out fails closed. `defineRawSql` is the explicit escape hatch for a query the
Drizzle builder cannot express; it requires stable ownership and a nontrivial review rationale. These helpers make
concurrency and exceptional SQL visible without becoming a generic repository or ORM facade.
