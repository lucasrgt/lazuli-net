export function entitySource(name: string, variable: string, table: string): string {
  return `import { integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

export const ${variable}Table = pgTable(${JSON.stringify(table)}, {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id").notNull(),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type ${name}Row = typeof ${variable}Table.$inferSelect;
export type New${name}Row = typeof ${variable}Table.$inferInsert;
`;
}

export function entityMigrationSource(table: string): string {
  return `CREATE TABLE ${table} (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ${table}_org_created_id_idx ON ${table} (org_id, created_at, id);
`;
}

export function entityTestSource(name: string, variable: string, fileBase: string, table: string): string {
  return `import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect } from "vitest";
import { unit } from "@skiesjs/testing";
import { ${variable}Table } from "./${fileBase}.entity.js";

describe("${name} table", () => {
  unit("has the explicit tenant and concurrency shape", () => {
    const columns = getTableColumns(${variable}Table);

    expect(getTableName(${variable}Table)).toBe(${JSON.stringify(table)});
    expect(Object.keys(columns)).toEqual(["id", "orgId", "version", "createdAt", "updatedAt"]);
    expect(columns.id.primary).toBe(true);
    expect(columns.orgId.notNull).toBe(true);
    expect(columns.version.notNull).toBe(true);
    expect(columns.version.hasDefault).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.updatedAt.notNull).toBe(true);
  });
});
`;
}

export function crudErrorSource(name: string, variable: string, prefix: string): string {
  return `import { Errors, type SkiesError } from "@skiesjs/core";
import { defineErrorCodes } from "@skiesjs/openapi";

export const ${name}ErrorCodes = defineErrorCodes({
  invalidId: ${JSON.stringify(`${prefix}.invalid_id`)},
  notFound: ${JSON.stringify(`${prefix}.not_found`)},
  versionConflict: ${JSON.stringify(`${prefix}.version_conflict`)},
  databaseUnavailable: ${JSON.stringify(`${prefix}.database_unavailable`)},
});

export type ${name}ErrorCode = (typeof ${name}ErrorCodes)[keyof typeof ${name}ErrorCodes];

export function ${variable}VersionConflict(message: string): SkiesError {
  return Errors.conflict(${name}ErrorCodes.versionConflict, message);
}
`;
}

export function uuidValueSource(name: string, variable: string, fileBase: string): string {
  return `import { Errors, Result, scalarCodec, type Result as Outcome } from "@skiesjs/core";
import { scalarSchema } from "@skiesjs/openapi";
import { ${name}ErrorCodes } from "../${fileBase}.errors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ${name}Id {
  private constructor(public readonly value: string) {}

  static from(value: string): Outcome<${name}Id> {
    return UUID.test(value) && value !== "00000000-0000-0000-0000-000000000000"
      ? Result.ok(new ${name}Id(value.toLowerCase()))
      : Result.fail(Errors.validation(${name}ErrorCodes.invalidId, ${JSON.stringify(`${name} id must be a non-nil UUID`)}));
  }
}

export const ${variable}IdCodec = scalarCodec<${name}Id, string>({
  primitive: { type: "string", format: "uuid" },
  encode: (value) => value.value,
  decode: ${name}Id.from,
});
export const ${variable}IdSchema = scalarSchema(${variable}IdCodec);
`;
}

export function crudQuerySource(name: string, variable: string, fileBase: string): string {
  return `import { and, asc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { Errors, Result, type Page, type Result as Outcome } from "@skiesjs/core";
import { executeVersionedMutation, pagePolicy, toPage } from "@skiesjs/drizzle-postgres";
import { ${variable}Table, type ${name}Row } from "../entities/${fileBase}.entity.js";
import { ${name}ErrorCodes } from "../${fileBase}.errors.js";
import type { ${name}Id } from "../values/${fileBase}-id.js";

export interface ${name}View {
  readonly id: string;
  readonly orgId: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ${name}Queries {
  create(input: { readonly id: ${name}Id; readonly orgId: string }, signal?: AbortSignal): Promise<Outcome<${name}View>>;
  get(input: { readonly id: ${name}Id; readonly orgId: string }, signal?: AbortSignal): Promise<Outcome<${name}View>>;
  list(input: { readonly orgId: string; readonly pageNumber: number; readonly pageSize: number }, signal?: AbortSignal): Promise<Outcome<Page<${name}View>>>;
  update(input: { readonly id: ${name}Id; readonly orgId: string; readonly expectedVersion: number }, signal?: AbortSignal): Promise<Outcome<${name}View>>;
  delete(input: { readonly id: ${name}Id; readonly orgId: string; readonly expectedVersion: number }, signal?: AbortSignal): Promise<Outcome<{ readonly deleted: true }>>;
}

const policy = pagePolicy({
  owner: ${JSON.stringify(`${fileBase}.queries`)},
  filter: ${JSON.stringify(`${fileBase}.owned_by_org`)},
  order: [
    { column: "createdAt", direction: "asc" },
    { column: "id", direction: "asc", unique: true },
  ],
});

function view(row: ${name}Row): ${name}View {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

/** Concrete entity-specific Drizzle queries; this is deliberately not a generic repository. */
export function create${name}Queries(db: PostgresJsDatabase): ${name}Queries {
  return {
    async create(input, signal) {
      signal?.throwIfAborted();
      const rows = await db.insert(${variable}Table).values({ id: input.id.value, orgId: input.orgId }).returning();
      signal?.throwIfAborted();
      const row = rows[0];
      if (row === undefined) throw new Error("insert did not return ${fileBase}");
      return Result.ok(view(row));
    },
    async get(input, signal) {
      signal?.throwIfAborted();
      const rows = await db.select().from(${variable}Table).where(and(
        eq(${variable}Table.id, input.id.value), eq(${variable}Table.orgId, input.orgId),
      )).limit(1);
      signal?.throwIfAborted();
      const row = rows[0];
      return row === undefined
        ? Result.fail(Errors.notFound(${name}ErrorCodes.notFound, ${JSON.stringify(`${name} was not found`)}))
        : Result.ok(view(row));
    },
    async list(input, signal) {
      const owned = eq(${variable}Table.orgId, input.orgId);
      const page = await toPage({
        pageNumber: input.pageNumber, pageSize: input.pageSize, policy,
        ...(signal === undefined ? {} : { signal }),
        count: async () => db.$count(${variable}Table, owned),
        select: async ({ offset, limit }) => db.select().from(${variable}Table).where(owned)
          .orderBy(asc(${variable}Table.createdAt), asc(${variable}Table.id)).limit(limit).offset(offset),
        project: view,
      });
      return Result.ok(page);
    },
    async update(input, signal) {
      const outcome = await executeVersionedMutation<${name}View | undefined>({
        expectedVersion: input.expectedVersion,
        ...(signal === undefined ? {} : { signal }),
        conflictCode: ${name}ErrorCodes.versionConflict,
        conflictMessage: ${JSON.stringify(`${name} changed since it was read`)},
        execute: async ({ expectedVersion }) => {
          const rows = await db.update(${variable}Table).set({
            version: sql\`${'${'}${variable}Table.version} + 1\`, updatedAt: new Date(),
          }).where(and(eq(${variable}Table.id, input.id.value), eq(${variable}Table.orgId, input.orgId),
            eq(${variable}Table.version, expectedVersion))).returning();
          return { affectedRows: rows.length, value: rows[0] === undefined ? undefined : view(rows[0]) };
        },
      });
      if (!outcome.ok) return outcome;
      if (outcome.value === undefined) throw new Error("versioned update returned no row");
      return Result.ok(outcome.value);
    },
    async delete(input, signal) {
      const outcome = await executeVersionedMutation<{ readonly deleted: true }>({
        expectedVersion: input.expectedVersion,
        ...(signal === undefined ? {} : { signal }),
        conflictCode: ${name}ErrorCodes.versionConflict,
        conflictMessage: ${JSON.stringify(`${name} changed since it was read`)},
        execute: async ({ expectedVersion }) => {
          const rows = await db.delete(${variable}Table).where(and(eq(${variable}Table.id, input.id.value),
            eq(${variable}Table.orgId, input.orgId), eq(${variable}Table.version, expectedVersion)))
            .returning({ id: ${variable}Table.id });
          return { affectedRows: rows.length, value: { deleted: true as const } };
        },
      });
      return outcome;
    },
  };
}

const unavailable = () => Result.fail(Errors.unavailable(
  ${name}ErrorCodes.databaseUnavailable, ${JSON.stringify(`${name} database dependency is not configured`)},
));

/** Safe runnable default; inject create${name}Queries(db) explicitly in the module composition root. */
export const unconfigured${name}Queries: ${name}Queries = {
  create: async () => unavailable(), get: async () => unavailable(), list: async () => unavailable(),
  update: async () => unavailable(), delete: async () => unavailable(),
};
`;
}
