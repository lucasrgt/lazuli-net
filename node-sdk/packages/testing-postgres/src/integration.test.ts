import { afterAll, describe, expect, it } from "vitest";
import { PostgresTestHarness } from "./index.js";

if (process.env["SKIES_TEST_POSTGRES"] !== "1") {
  throw new Error("PostgreSQL integration evidence requires SKIES_TEST_POSTGRES=1");
}

describe("PostgresTestHarness Docker integration", () => {
  const harness = new PostgresTestHarness({
    migrateTemplate: async ({ sql, signal }) => {
      signal.throwIfAborted();
      await sql.unsafe(`
        CREATE TABLE ledger_entries (
          id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          note text NOT NULL
        )
      `);
      signal.throwIfAborted();
    },
  });

  afterAll(async () => harness.dispose(), 120_000);

  it("isolates unkeyed clones on the real PostgreSQL engine", { timeout: 120_000 }, async () => {
    const first = await harness.createStore();
    const second = await harness.createStore();
    try {
      await first.sql.unsafe("INSERT INTO ledger_entries (note) VALUES ('first clone')");
      const firstRows = await first.sql.unsafe<{ note: string }[]>(
        "SELECT note FROM ledger_entries ORDER BY id",
      );
      const secondRows = await second.sql.unsafe<{ note: string }[]>(
        "SELECT note FROM ledger_entries ORDER BY id",
      );

      expect(firstRows.map((row) => row.note)).toEqual(["first clone"]);
      expect(secondRows).toHaveLength(0);
    } finally {
      await Promise.all([first.dispose(), second.dispose()]);
    }
  });

  it("shares one keyed clone until its final lease is returned", { timeout: 120_000 }, async () => {
    const [writer, reader] = await Promise.all([
      harness.createStore({ key: "same journey" }),
      harness.createStore({ key: "same journey" }),
    ]);
    try {
      expect(writer.connectionUrl).toBe(reader.connectionUrl);
      await writer.sql.unsafe("INSERT INTO ledger_entries (note) VALUES ('shared write')");
      const rows = await reader.sql.unsafe<{ note: string }[]>(
        "SELECT note FROM ledger_entries ORDER BY id",
      );
      expect(rows.map((row) => row.note)).toEqual(["shared write"]);

      await writer.dispose();
      const afterFirstReturn = await reader.sql.unsafe<{ total: number }[]>(
        "SELECT count(*)::int AS total FROM ledger_entries",
      );
      expect(afterFirstReturn[0]?.total).toBe(1);
    } finally {
      await Promise.all([writer.dispose(), reader.dispose()]);
    }
  });
});
