import { PostgreSqlContainer } from "@testcontainers/postgresql";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";

/** Pool limits used for one short-lived PostgreSQL client. */
export interface PostgresPoolLimits {
  /** Maximum simultaneous connections. */
  readonly maximum: number;
  /** Seconds before an unused connection is pruned. */
  readonly idleSeconds: number;
}

/** The running disposable server needed by the harness. */
export interface StartedPostgresTestServer {
  /** URL of the `postgres` maintenance database. */
  readonly maintenanceUrl: string;
  /** Stop and reap the disposable server. */
  dispose(): Promise<void>;
}

/**
 * Injectable Testcontainers/Postgres.js boundary. The default is production-ready; the seam keeps lifecycle races
 * testable without Docker and also lets specialized test infrastructure supply an equivalent disposable server.
 */
export interface PostgresTestRuntime {
  /** Maximum duration of each setup SQL operation and template migration. */
  readonly setupTimeoutMilliseconds: number;
  /** Start a disposable server only when the first store is requested. */
  start(image: string, signal: AbortSignal): Promise<StartedPostgresTestServer>;
  /** Open a Postgres.js client with the requested small pool. */
  connect(connectionUrl: string, limits: PostgresPoolLimits): Sql;
  /** Execute setup SQL with cancellation and the runtime's setup timeout. */
  execute(
    sql: Sql,
    statement: string,
    parameters: readonly unknown[],
    signal?: AbortSignal,
  ): Promise<readonly Record<string, unknown>[]>;
  /** Generate an internal database identifier beginning with the supplied prefix. */
  identifier(prefix: string): string;
}

const SETUP_TIMEOUT_MILLISECONDS = 300_000;

/** Default modular Testcontainers PostgreSQL and Postgres.js runtime. */
export const nodePostgresTestRuntime: PostgresTestRuntime = {
  setupTimeoutMilliseconds: SETUP_TIMEOUT_MILLISECONDS,

  async start(image, signal) {
    signal.throwIfAborted();
    const container = await new PostgreSqlContainer(image)
      .withDatabase("postgres")
      .withUsername("postgres")
      .withPassword("postgres")
      .withCommand([
        "postgres",
        "-c", "fsync=off",
        "-c", "synchronous_commit=off",
        "-c", "full_page_writes=off",
        "-c", "max_wal_size=2GB",
      ])
      .start();

    if (signal.aborted) {
      await container.stop();
      signal.throwIfAborted();
    }
    return {
      maintenanceUrl: container.getConnectionUri(),
      async dispose() { await container.stop(); },
    };
  },

  connect(connectionUrl, limits) {
    return postgres(connectionUrl, {
      max: limits.maximum,
      idle_timeout: limits.idleSeconds,
      connect_timeout: 30,
      max_lifetime: 60,
    });
  },

  async execute(sql, statement, parameters, signal) {
    signal?.throwIfAborted();
    const query = sql.unsafe(statement, [...parameters] as never);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      query.cancel();
    }, SETUP_TIMEOUT_MILLISECONDS);
    timeout.unref();
    const abort = () => query.cancel();
    signal?.addEventListener("abort", abort, { once: true });

    try {
      const rows = await query;
      signal?.throwIfAborted();
      if (timedOut) throw new Error("PostgreSQL setup command exceeded 300 seconds.");
      return rows;
    } catch (caught) {
      if (signal?.aborted) throw signal.reason;
      if (timedOut) {
        throw new Error("PostgreSQL setup command exceeded 300 seconds.", { cause: caught });
      }
      throw caught;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  },

  identifier(prefix) {
    return `${prefix}${randomUUID().replaceAll("-", "")}`;
  },
};
