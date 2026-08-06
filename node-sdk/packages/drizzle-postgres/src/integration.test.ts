import { afterAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { boolean, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import { PostgresTestHarness } from "@skiesjs/testing-postgres";
import { pagePolicy, toPage } from "./index.js";

if (process.env["SKIES_TEST_POSTGRES"] !== "1") {
  throw new Error("PostgreSQL integration evidence requires SKIES_TEST_POSTGRES=1");
}
const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  archived: boolean("archived").notNull().default(false),
});
const policy = pagePolicy({
  owner: "wallets",
  filter: "wallets.active_for_org",
  order: [
    { column: "createdAt", direction: "asc" },
    { column: "id", direction: "asc", unique: true },
  ],
});

describe("ordered PostgreSQL page", () => {
  const harness = new PostgresTestHarness({
    migrateTemplate: async ({ sql }) => {
      await sql.unsafe(`CREATE TABLE wallets (
        id uuid PRIMARY KEY, org_id uuid NOT NULL, name varchar(80) NOT NULL,
        created_at timestamptz NOT NULL, archived boolean NOT NULL DEFAULT false
      )`);
    },
  });
  afterAll(async () => harness.dispose(), 120_000);

  it("uses one tenant filter, clamps materialization, and breaks equal timestamps by the unique id", { timeout: 120_000 }, async () => {
    const store = await harness.createStore();
    try {
      await store.sql.unsafe(`INSERT INTO wallets (id, org_id, name, created_at, archived) VALUES
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','B','2030-01-01',false),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','A','2030-01-01',false),
        ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','C','2030-01-02',false),
        ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222','other','2030-01-01',false),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','archived','2029-01-01',true)`);
      const db = drizzle(store.sql);
      const filter = and(
        eq(wallets.orgId, "11111111-1111-4111-8111-111111111111"),
        eq(wallets.archived, false),
      );
      const page = await toPage({
        pageNumber: 1,
        pageSize: 50,
        maxPageSize: 2,
        policy,
        count: async ({ policy: received }) => {
          expect(received).toBe(policy);
          return db.$count(wallets, filter);
        },
        select: async ({ offset, limit, policy: received }) => {
          expect(received).toBe(policy);
          return db.select({ id: wallets.id }).from(wallets).where(filter)
            .orderBy(asc(wallets.createdAt), asc(wallets.id)).limit(limit).offset(offset);
        },
        project: (row) => row.id,
      });

      expect(page).toEqual({
        items: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
        totalCount: 3,
        pageNumber: 1,
        pageSize: 2,
      });
    } finally {
      await store.dispose();
    }
  });
});
