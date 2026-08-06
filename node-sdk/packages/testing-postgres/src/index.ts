import type { Sql } from "postgres";
import { connectionUrlFor, internalIdentifier, quoteIdentifier } from "./internal.js";
import {
  nodePostgresTestRuntime,
  type PostgresTestRuntime,
  type StartedPostgresTestServer,
} from "./runtime.js";

export {
  nodePostgresTestRuntime,
  type PostgresPoolLimits,
  type PostgresTestRuntime,
  type StartedPostgresTestServer,
} from "./runtime.js";

const TEMPLATE_PREFIX = "skies_tpl_";
const CLONE_PREFIX = "skies_cln_";
const ADMIN_POOL = { maximum: 1, idleSeconds: 1 } as const;
const TEMPLATE_POOL = { maximum: 1, idleSeconds: 1 } as const;
const STORE_POOL = { maximum: 4, idleSeconds: 1 } as const;

/** The one template connection supplied to the application's migration callback. */
export interface PostgresTemplateMigrationContext {
  /** Postgres.js client targeting the otherwise empty template database. */
  readonly sql: Sql;
  /** Encoded connection URL for migration libraries that require one. */
  readonly connectionUrl: string;
  /** Bounded setup signal; migration work should propagate it where supported. */
  readonly signal: AbortSignal;
}

/** Configuration for a lazy disposable PostgreSQL test harness. */
export interface PostgresTestHarnessOptions {
  /** Migrate the template exactly once before any clone is made. */
  readonly migrateTemplate: (context: PostgresTemplateMigrationContext) => Promise<void>;
  /** PostgreSQL image, overridden only when application tests need extensions. */
  readonly image?: string;
  /** Injectable container and SQL seam; applications normally use the default. */
  readonly runtime?: PostgresTestRuntime;
}

/** Options for leasing one isolated or deliberately shared test store. */
export interface PostgresTestStoreOptions {
  /** Calls with the same key share a clone until their final lease is disposed. */
  readonly key?: string;
}

interface ReadyState {
  readonly server: StartedPostgresTestServer;
  readonly maintenanceUrl: string;
  readonly admin: Sql;
  readonly template: string;
}

interface KeyedEntry {
  readonly creation: Promise<string>;
  references: number;
}

/**
 * A template-cloned PostgreSQL harness: one lazy Testcontainers server and one migration are shared by all stores,
 * while each unkeyed lease receives a physical database clone on the real engine.
 */
export class PostgresTestHarness {
  readonly #migrateTemplate: PostgresTestHarnessOptions["migrateTemplate"];
  readonly #image: string;
  readonly #runtime: PostgresTestRuntime;
  readonly #keyed = new Map<string, KeyedEntry>();
  readonly #stores = new Set<PostgresTestStore>();
  readonly #storeCreations = new Set<Promise<PostgresTestStore>>();
  #ready: Promise<ReadyState> | undefined;
  #exclusiveTail: Promise<void> = Promise.resolve();
  #disposed = false;
  #disposePromise: Promise<void> | undefined;

  /** Declare a suite database without starting Docker or opening a socket. */
  constructor(options: PostgresTestHarnessOptions) {
    this.#migrateTemplate = options.migrateTemplate;
    this.#image = options.image ?? "postgres:17-alpine";
    this.#runtime = options.runtime ?? nodePostgresTestRuntime;
    if (this.#runtime.setupTimeoutMilliseconds <= 0) {
      throw new RangeError("runtime.setupTimeoutMilliseconds must be positive.");
    }
  }

  /**
   * Lease a fresh clone, or a reference-counted shared clone when `key` is present. Disposing the returned store
   * closes its tiny Postgres.js pool and drops the clone after its final lease.
   */
  async createStore(options: PostgresTestStoreOptions = {}): Promise<PostgresTestStore> {
    this.#assertActive();
    const creation = this.#createStoreCore(options);
    this.#storeCreations.add(creation);
    try {
      return await creation;
    } finally {
      this.#storeCreations.delete(creation);
    }
  }

  async #createStoreCore(options: PostgresTestStoreOptions): Promise<PostgresTestStore> {
    const ready = await this.#ensureReady();
    this.#assertActive();

    const lease = options.key === undefined
      ? { database: await this.#cloneTemplate(ready), entry: undefined }
      : await this.#leaseKeyed(ready, options.key);

    if (this.#disposed) {
      await this.#releaseDatabase(ready, lease.database, options.key, lease.entry);
      this.#assertActive();
    }

    const connectionUrl = connectionUrlFor(ready.maintenanceUrl, lease.database);
    let store: PostgresTestStore;
    try {
      const sql = this.#runtime.connect(connectionUrl, STORE_POOL);
      store = new PostgresTestStore(connectionUrl, sql, async () => {
        try {
          await this.#releaseDatabase(ready, lease.database, options.key, lease.entry);
        } finally {
          this.#stores.delete(store);
        }
      });
    } catch (caught) {
      await this.#releaseDatabase(ready, lease.database, options.key, lease.entry);
      throw caught;
    }
    this.#stores.add(store);

    if (this.#disposed) {
      await store.dispose();
      this.#assertActive();
    }
    return store;
  }

  /** Stop outstanding stores, close administration pools, and reap the shared container. Idempotent. */
  dispose(): Promise<void> {
    this.#disposePromise ??= this.#disposeCore();
    return this.#disposePromise;
  }

  /** Enable `await using` on Node.js 24 while retaining an explicit `dispose()` for fixture APIs. */
  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose();
  }

  async #disposeCore(): Promise<void> {
    this.#disposed = true;
    let ready: ReadyState | undefined;
    try {
      ready = await this.#ensureReadyIfStarted();
    } catch {
      return;
    }
    if (ready === undefined) return;

    await Promise.allSettled([...this.#storeCreations]);
    const errors: unknown[] = [];
    const results = await Promise.allSettled([...this.#stores].map(async (store) => store.dispose()));
    for (const result of results) {
      if (result.status === "rejected") errors.push(result.reason);
    }
    await captureError(errors, async () => ready.admin.end({ timeout: 1 }));
    await captureError(errors, async () => ready.server.dispose());
    throwCollected(errors, "PostgreSQL test harness disposal failed.");
  }

  async #initialize(): Promise<ReadyState> {
    const signal = AbortSignal.timeout(this.#runtime.setupTimeoutMilliseconds);
    let server: StartedPostgresTestServer | undefined;
    let admin: Sql | undefined;
    let template: string | undefined;
    const cleanupErrors: unknown[] = [];

    try {
      server = await this.#runtime.start(this.#image, signal);
      signal.throwIfAborted();
      admin = this.#runtime.connect(server.maintenanceUrl, ADMIN_POOL);
      await this.#reapStale(admin, signal);

      template = internalIdentifier(this.#runtime.identifier(TEMPLATE_PREFIX), TEMPLATE_PREFIX);
      await this.#execute(admin, `CREATE DATABASE ${quoteIdentifier(template)}`, [], signal);
      const templateUrl = connectionUrlFor(server.maintenanceUrl, template);
      const templateSql = this.#runtime.connect(templateUrl, TEMPLATE_POOL);
      try {
        const migration = Promise.resolve().then(async () => this.#migrateTemplate({
          sql: templateSql,
          connectionUrl: templateUrl,
          signal,
        }));
        await raceWithSignal(migration, signal, "PostgreSQL template migration exceeded 300 seconds.");
      } finally {
        await templateSql.end({ timeout: 1 });
      }
      signal.throwIfAborted();
      return { server, maintenanceUrl: server.maintenanceUrl, admin, template };
    } catch (caught) {
      if (admin !== undefined && template !== undefined) {
        const cleanupAdmin = admin;
        const cleanupTemplate = template;
        await captureError(cleanupErrors, async () => this.#drop(cleanupAdmin, cleanupTemplate));
      }
      if (admin !== undefined) {
        const cleanupAdmin = admin;
        await captureError(cleanupErrors, async () => cleanupAdmin.end({ timeout: 1 }));
      }
      if (server !== undefined) {
        const cleanupServer = server;
        await captureError(cleanupErrors, async () => cleanupServer.dispose());
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError([caught, ...cleanupErrors], "PostgreSQL template setup and cleanup failed.");
      }
      throw caught;
    }
  }

  #ensureReady(): Promise<ReadyState> {
    this.#ready ??= this.#initialize();
    return this.#ready;
  }

  async #ensureReadyIfStarted(): Promise<ReadyState | undefined> {
    return this.#ready === undefined ? undefined : this.#ready;
  }

  async #reapStale(admin: Sql, signal: AbortSignal): Promise<void> {
    const rows = await this.#execute(admin,
      "SELECT datname FROM pg_database WHERE starts_with(datname, $1) OR starts_with(datname, $2) ORDER BY datname",
      [TEMPLATE_PREFIX, CLONE_PREFIX], signal);
    for (const row of rows) {
      const database = row["datname"];
      if (typeof database === "string"
        && (database.startsWith(TEMPLATE_PREFIX) || database.startsWith(CLONE_PREFIX))) {
        await this.#drop(admin, database, signal);
      }
    }
  }

  async #cloneTemplate(ready: ReadyState): Promise<string> {
    return this.#exclusive(async () => {
      this.#assertActive();
      const database = internalIdentifier(this.#runtime.identifier(CLONE_PREFIX), CLONE_PREFIX);
      try {
        await this.#execute(ready.admin,
          `CREATE DATABASE ${quoteIdentifier(database)} TEMPLATE ${quoteIdentifier(ready.template)} STRATEGY file_copy`);
      } catch (caught) {
        const errors: unknown[] = [caught];
        await captureError(errors, async () => this.#drop(ready.admin, database));
        if (errors.length > 1) throw new AggregateError(errors, "PostgreSQL clone and cleanup failed.");
        throw caught;
      }
      return database;
    });
  }

  async #leaseKeyed(
    ready: ReadyState,
    key: string,
  ): Promise<{ database: string; entry: KeyedEntry }> {
    let entry = this.#keyed.get(key);
    if (entry === undefined) {
      entry = { creation: this.#cloneTemplate(ready), references: 0 };
      this.#keyed.set(key, entry);
    }
    entry.references += 1;
    try {
      return { database: await entry.creation, entry };
    } catch (caught) {
      entry.references -= 1;
      if (entry.references === 0 && this.#keyed.get(key) === entry) this.#keyed.delete(key);
      throw caught;
    }
  }

  async #releaseDatabase(
    ready: ReadyState,
    database: string,
    key: string | undefined,
    entry: KeyedEntry | undefined,
  ): Promise<void> {
    if (key !== undefined && entry !== undefined) {
      entry.references -= 1;
      if (entry.references > 0) return;
      if (this.#keyed.get(key) === entry) this.#keyed.delete(key);
    }
    await this.#drop(ready.admin, database);
  }

  async #drop(admin: Sql, database: string, signal?: AbortSignal): Promise<void> {
    await this.#execute(admin, `DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`, [], signal);
  }

  #execute(admin: Sql, statement: string, parameters: readonly unknown[] = [], signal?: AbortSignal) {
    return this.#runtime.execute(admin, statement, parameters, signal);
  }

  async #exclusive<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.#exclusiveTail;
    let release: () => void = () => undefined;
    this.#exclusiveTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("The PostgreSQL test harness has been disposed.");
  }
}

/** A leased clone with a tiny Postgres.js pool and asynchronous idempotent cleanup. */
export class PostgresTestStore {
  #disposePromise: Promise<void> | undefined;

  /** @internal Stores are obtained from {@link PostgresTestHarness.createStore}. */
  constructor(
    /** Encoded PostgreSQL URL targeting this clone. */
    readonly connectionUrl: string,
    /** Postgres.js client limited to four aggressively pruned connections. */
    readonly sql: Sql,
    private readonly release: () => Promise<void>,
  ) {}

  /** Close the pool and drop the clone after its final keyed lease. Idempotent under concurrent calls. */
  dispose(): Promise<void> {
    this.#disposePromise ??= this.#disposeCore();
    return this.#disposePromise;
  }

  /** Enable `await using` without hiding the explicit fixture lifetime. */
  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose();
  }

  async #disposeCore(): Promise<void> {
    const errors: unknown[] = [];
    await captureError(errors, async () => this.sql.end({ timeout: 1 }));
    await captureError(errors, this.release);
    throwCollected(errors, "PostgreSQL test store disposal failed.");
  }
}

async function raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal, message: string): Promise<T> {
  signal.throwIfAborted();
  let rejectAbort: (reason?: unknown) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const abort = () => rejectAbort(new Error(message, { cause: signal.reason }));
  signal.addEventListener("abort", abort, { once: true });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

async function captureError(errors: unknown[], operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (caught) {
    errors.push(caught);
  }
}

function throwCollected(errors: unknown[], message: string): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}
