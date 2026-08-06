import type { Sql } from "postgres";
import { describe, expect, it, vi } from "vitest";
import {
  PostgresTestHarness,
  nodePostgresTestRuntime,
  type PostgresPoolLimits,
  type PostgresTestRuntime,
  type StartedPostgresTestServer,
} from "./index.js";
import { connectionUrlFor, quoteIdentifier } from "./internal.js";

interface RecordedClient {
  readonly connectionUrl: string;
  readonly limits: PostgresPoolLimits;
  readonly sql: Sql;
  readonly end: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

class FakeRuntime implements PostgresTestRuntime {
  readonly setupTimeoutMilliseconds = 5_000;
  readonly databases = new Set(["postgres"]);
  readonly statements: { sql: string; parameters: readonly unknown[] }[] = [];
  readonly clients: RecordedClient[] = [];
  startCalls = 0;
  stopCalls = 0;
  identifierSequence = 0;
  failNextClone: Error | undefined;
  failStoreEnd: Error | undefined;
  cloneGate: Promise<void> | undefined;

  async start(_image: string, signal: AbortSignal): Promise<StartedPostgresTestServer> {
    signal.throwIfAborted();
    this.startCalls += 1;
    return {
      maintenanceUrl: "postgres://postgres:p%40ss@localhost:55432/postgres?sslmode=disable",
      dispose: async () => { this.stopCalls += 1; },
    };
  }

  connect(connectionUrl: string, limits: PostgresPoolLimits): Sql {
    const end = vi.fn(async () => {
      if (limits.maximum === 4 && this.failStoreEnd !== undefined) throw this.failStoreEnd;
    });
    const sql = { end } as unknown as Sql;
    this.clients.push({ connectionUrl, limits, sql, end });
    return sql;
  }

  async execute(
    _sql: Sql,
    statement: string,
    parameters: readonly unknown[],
    signal?: AbortSignal,
  ): Promise<readonly Record<string, unknown>[]> {
    signal?.throwIfAborted();
    this.statements.push({ sql: statement, parameters });
    if (statement.startsWith("SELECT datname")) {
      const prefixes = parameters.filter((value): value is string => typeof value === "string");
      return [...this.databases]
        .filter((database) => prefixes.some((prefix) => database.startsWith(prefix)))
        .sort()
        .map((datname) => ({ datname }));
    }

    const database = readQuotedDatabase(statement);
    if (statement.startsWith("DROP DATABASE")) {
      this.databases.delete(database);
      return [];
    }
    if (statement.startsWith("CREATE DATABASE")) {
      if (statement.includes(" TEMPLATE ")) {
        await this.cloneGate;
        this.databases.add(database);
        if (this.failNextClone !== undefined) {
          const failure = this.failNextClone;
          this.failNextClone = undefined;
          throw failure;
        }
      } else {
        this.databases.add(database);
      }
      return [];
    }
    throw new Error(`Unexpected SQL: ${statement}`);
  }

  identifier(prefix: string): string {
    this.identifierSequence += 1;
    return `${prefix}${String(this.identifierSequence).padStart(4, "0")}`;
  }

  cloneCreates(): readonly string[] {
    return this.statements
      .map((record) => record.sql)
      .filter((statement) => statement.startsWith("CREATE DATABASE") && statement.includes(" TEMPLATE "));
  }

  cloneDrops(): readonly string[] {
    return this.statements
      .map((record) => record.sql)
      .filter((statement) => statement.startsWith("DROP DATABASE") && statement.includes("skies_cln_"));
  }
}

describe("PostgresTestHarness", () => {
  it("starts lazily, reaps stale templates and clones, and migrates one new template", async () => {
    const runtime = new FakeRuntime();
    runtime.databases.add("skies_tpl_stale");
    runtime.databases.add("skies_cln_stale");
    runtime.databases.add("application_database");
    const migrateTemplate = vi.fn(async () => undefined);
    const harness = new PostgresTestHarness({ runtime, migrateTemplate });

    expect(runtime.startCalls).toBe(0);
    const first = await harness.createStore();
    const second = await harness.createStore();

    expect(runtime.startCalls).toBe(1);
    expect(migrateTemplate).toHaveBeenCalledTimes(1);
    expect(runtime.databases).not.toContain("skies_tpl_stale");
    expect(runtime.databases).not.toContain("skies_cln_stale");
    expect(runtime.databases).toContain("application_database");
    expect(first.connectionUrl).not.toBe(second.connectionUrl);
    expect(runtime.cloneCreates()).toHaveLength(2);
    const storeClients = runtime.clients.filter((client) => client.limits.maximum === 4);
    expect(storeClients).toHaveLength(2);
    expect(storeClients.every((client) => client.limits.idleSeconds === 1)).toBe(true);

    await harness.dispose();
    expect(runtime.stopCalls).toBe(1);
    expect(runtime.cloneDrops()).toHaveLength(3);
  });

  it("reserves one keyed clone before awaiting it, so racing callers cannot leak a loser", async () => {
    const runtime = new FakeRuntime();
    let releaseClone: () => void = () => undefined;
    runtime.cloneGate = new Promise<void>((resolve) => { releaseClone = resolve; });
    const harness = new PostgresTestHarness({ runtime, migrateTemplate: async () => undefined });

    const firstPromise = harness.createStore({ key: "shared wallet" });
    const secondPromise = harness.createStore({ key: "shared wallet" });
    await vi.waitFor(() => expect(runtime.cloneCreates()).toHaveLength(1));
    releaseClone();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(first.connectionUrl).toBe(second.connectionUrl);
    expect(runtime.cloneCreates()).toHaveLength(1);
    await first.dispose();
    expect(runtime.cloneDrops()).toHaveLength(0);
    await second.dispose();
    expect(runtime.cloneDrops()).toHaveLength(1);
    await harness.dispose();
  });

  it("drops a clone when creation reports failure and never retries the unsafe command", async () => {
    const runtime = new FakeRuntime();
    const failure = new Error("clone timed out after the server created it");
    runtime.failNextClone = failure;
    const harness = new PostgresTestHarness({ runtime, migrateTemplate: async () => undefined });

    await expect(harness.createStore()).rejects.toBe(failure);

    expect(runtime.cloneCreates()).toHaveLength(1);
    expect(runtime.cloneDrops()).toHaveLength(1);
    expect([...runtime.databases].filter((name) => name.startsWith("skies_cln_"))).toEqual([]);
    await harness.dispose();
  });

  it("makes concurrent double disposal share one pool close and one database drop", async () => {
    const runtime = new FakeRuntime();
    const harness = new PostgresTestHarness({ runtime, migrateTemplate: async () => undefined });
    const store = await harness.createStore();
    const storeClient = runtime.clients.at(-1);

    await Promise.all([store.dispose(), store.dispose()]);
    await store.dispose();

    expect(storeClient?.end).toHaveBeenCalledTimes(1);
    expect(runtime.cloneDrops()).toHaveLength(1);
    await harness.dispose();
  });

  it("still drops the clone when closing its client pool fails", async () => {
    const runtime = new FakeRuntime();
    const failure = new Error("pool close failed");
    runtime.failStoreEnd = failure;
    const harness = new PostgresTestHarness({ runtime, migrateTemplate: async () => undefined });
    const store = await harness.createStore();

    await expect(store.dispose()).rejects.toBe(failure);

    expect(runtime.cloneDrops()).toHaveLength(1);
    await harness.dispose();
  });

  it("cleans up the template and server when migration fails", async () => {
    const runtime = new FakeRuntime();
    const failure = new Error("bad migration");
    const harness = new PostgresTestHarness({
      runtime,
      migrateTemplate: async () => { throw failure; },
    });

    await expect(harness.createStore()).rejects.toBe(failure);

    expect([...runtime.databases].filter((name) => name.startsWith("skies_tpl_"))).toEqual([]);
    expect(runtime.clients.every((client) => client.end.mock.calls.length === 1)).toBe(true);
    expect(runtime.stopCalls).toBe(1);
    await harness.dispose();
    expect(runtime.stopCalls).toBe(1);
  });

  it("waits for an in-flight clone and reclaims it when disposal wins the race", async () => {
    const runtime = new FakeRuntime();
    let releaseClone: () => void = () => undefined;
    runtime.cloneGate = new Promise<void>((resolve) => { releaseClone = resolve; });
    const harness = new PostgresTestHarness({ runtime, migrateTemplate: async () => undefined });
    const creation = harness.createStore();
    await vi.waitFor(() => expect(runtime.cloneCreates()).toHaveLength(1));

    const disposal = harness.dispose();
    releaseClone();

    await expect(creation).rejects.toThrow("disposed");
    await disposal;
    expect(runtime.cloneDrops()).toHaveLength(1);
    expect(runtime.stopCalls).toBe(1);
  });

  it("whole-harness disposal returns outstanding clones and is idempotent", async () => {
    const runtime = new FakeRuntime();
    const harness = new PostgresTestHarness({ runtime, migrateTemplate: async () => undefined });
    const isolated = await harness.createStore();
    const sharedOne = await harness.createStore({ key: "shared" });
    const sharedTwo = await harness.createStore({ key: "shared" });

    await Promise.all([harness.dispose(), harness.dispose()]);

    expect(runtime.cloneCreates()).toHaveLength(2);
    expect(runtime.cloneDrops()).toHaveLength(2);
    expect(runtime.stopCalls).toBe(1);
    await Promise.all([isolated.dispose(), sharedOne.dispose(), sharedTwo.dispose()]);
    await expect(harness.createStore()).rejects.toThrow("disposed");
  });
});

describe("PostgreSQL defaults", () => {
  it("bounds every default runtime setup command at 300 seconds", () => {
    expect(nodePostgresTestRuntime.setupTimeoutMilliseconds).toBe(300_000);
  });
});

describe("PostgreSQL identifiers and URLs", () => {
  it("quotes embedded identifier quotes and rejects NUL bytes", () => {
    expect(quoteIdentifier('clone "one"')).toBe('"clone ""one"""');
    expect(() => quoteIdentifier("clone\0one")).toThrow("NUL");
  });

  it("encodes the database as one path segment without corrupting credentials or options", () => {
    const connection = connectionUrlFor(
      "postgres://user:p%40ss@localhost:5432/postgres?sslmode=disable",
      "clone / #one",
    );

    expect(connection).toBe(
      "postgres://user:p%40ss@localhost:5432/clone%20%2F%20%23one?sslmode=disable",
    );
  });
});

function readQuotedDatabase(statement: string): string {
  const match = /DATABASE(?: IF EXISTS)? "((?:[^"]|"")+)"/u.exec(statement);
  if (match?.[1] === undefined) throw new Error(`Missing quoted database identifier: ${statement}`);
  return match[1].replaceAll('""', '"');
}
