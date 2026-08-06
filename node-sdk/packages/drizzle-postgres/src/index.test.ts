import { describe, expect, it, vi } from "vitest";
import { defineRawSql, executeVersionedMutation, pagePolicy, toPage } from "./index.js";

const POLICY = pagePolicy({
  owner: "wallets",
  filter: "wallets.active",
  order: [
    { column: "createdAt", direction: "asc" },
    { column: "id", direction: "asc", unique: true },
  ],
});

describe("toPage", () => {
  it("counts before selecting the requested offset and projects the materialized rows", async () => {
    const events: string[] = [];
    const signal = new AbortController().signal;
    const count = vi.fn(async (received) => {
      events.push("count");
      expect(received.signal).toBe(signal);
      expect(received.policy).toBe(POLICY);
      return 7;
    });
    const select = vi.fn(async ({ offset, limit, signal: received, policy }) => {
      events.push("select");
      expect(received).toBe(signal);
      expect(policy).toBe(POLICY);
      expect({ offset, limit }).toEqual({ offset: 3, limit: 3 });
      return [{ value: 4 }, { value: 5 }, { value: 6 }];
    });

    const page = await toPage({
      pageNumber: 2,
      pageSize: 3,
      policy: POLICY,
      signal,
      count,
      select,
      project: (row, index) => {
        events.push(`project:${index}`);
        return String(row.value);
      },
    });

    expect(page).toEqual({
      items: ["4", "5", "6"],
      totalCount: 7,
      pageNumber: 2,
      pageSize: 3,
    });
    expect(events).toEqual(["count", "select", "project:0", "project:1", "project:2"]);
  });

  it("echoes the effective lower and upper bounds", async () => {
    const lower = await toPage({
      pageNumber: -5,
      pageSize: 0,
      policy: POLICY,
      count: async () => 5,
      select: async (selection) => {
        expect(selection).toMatchObject({ offset: 0, limit: 1 });
        return [1];
      },
      project: String,
    });
    const upper = await toPage({
      pageNumber: 1,
      pageSize: 10_000,
      policy: POLICY,
      maxPageSize: 50,
      count: async () => 5,
      select: async (selection) => {
        expect(selection).toMatchObject({ offset: 0, limit: 50 });
        return [1, 2, 3, 4, 5];
      },
      project: String,
    });

    expect(lower).toMatchObject({ pageNumber: 1, pageSize: 1 });
    expect(upper).toMatchObject({ pageNumber: 1, pageSize: 50 });
  });

  it("keeps the total and effective bounds on a page past the end", async () => {
    const page = await toPage({
      pageNumber: 9,
      pageSize: 20,
      policy: POLICY,
      count: async () => 4,
      select: async ({ offset, limit }) => {
        expect({ offset, limit }).toEqual({ offset: 160, limit: 20 });
        return [];
      },
      project: (value: never) => value,
    });

    expect(page).toEqual({ items: [], totalCount: 4, pageNumber: 9, pageSize: 20 });
  });

  it("does no query work when the request is already aborted", async () => {
    const reason = new Error("request cancelled");
    const controller = new AbortController();
    controller.abort(reason);
    const count = vi.fn(async () => 0);
    const select = vi.fn(async () => []);

    await expect(toPage({
      pageNumber: 1,
      pageSize: 20,
      policy: POLICY,
      signal: controller.signal,
      count,
      select,
      project: (value: never) => value,
    })).rejects.toBe(reason);
    expect(count).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it("does not select when cancellation happens while counting", async () => {
    const reason = new Error("count cancelled");
    const controller = new AbortController();
    const select = vi.fn(async () => []);

    await expect(toPage({
      pageNumber: 1,
      pageSize: 20,
      policy: POLICY,
      signal: controller.signal,
      count: async (received) => {
        expect(received.signal).toBe(controller.signal);
        expect(received.policy).toBe(POLICY);
        controller.abort(reason);
        return 1;
      },
      select,
      project: (value: never) => value,
    })).rejects.toBe(reason);
    expect(select).not.toHaveBeenCalled();
  });

  it("propagates count, select, and projection errors unchanged", async () => {
    const countFailure = new Error("count failed");
    const selectFailure = new Error("select failed");
    const projectionFailure = new Error("projection failed");

    await expect(toPage({
      pageNumber: 1,
      pageSize: 10,
      policy: POLICY,
      count: async () => { throw countFailure; },
      select: async () => [],
      project: (value: never) => value,
    })).rejects.toBe(countFailure);
    await expect(toPage({
      pageNumber: 1,
      pageSize: 10,
      policy: POLICY,
      count: async () => 1,
      select: async () => { throw selectFailure; },
      project: (value: never) => value,
    })).rejects.toBe(selectFailure);
    await expect(toPage({
      pageNumber: 1,
      pageSize: 10,
      policy: POLICY,
      count: async () => 1,
      select: async () => [1],
      project: () => { throw projectionFailure; },
    })).rejects.toBe(projectionFailure);
  });
});

describe("persistence policies", () => {
  it("requires one final unique ordering tie-breaker and rejects ambiguous policy metadata", () => {
    expect(() => pagePolicy({ owner: "wallets", filter: "active", order: [] })).toThrow("at least one");
    expect(() => pagePolicy({
      owner: "wallets", filter: "active",
      order: [{ column: "createdAt", direction: "asc" }],
    })).toThrow("unique tie-breaker");
    expect(() => pagePolicy({
      owner: "wallets", filter: "active",
      order: [
        { column: "id", direction: "asc", unique: true },
        { column: "createdAt", direction: "asc" },
      ],
    })).toThrow("only the final");
  });

  it("turns zero affected rows into a conflict and rejects mutation fan-out", async () => {
    const conflict = await executeVersionedMutation({
      expectedVersion: 4,
      conflictCode: "wallet.version_conflict",
      conflictMessage: "wallet changed",
      execute: async ({ expectedVersion }) => ({ affectedRows: 0, value: expectedVersion }),
    });
    expect(conflict).toMatchObject({ ok: false, error: { kind: "Conflict", code: "wallet.version_conflict" } });

    await expect(executeVersionedMutation({
      expectedVersion: 4,
      conflictCode: "wallet.version_conflict",
      conflictMessage: "wallet changed",
      execute: async () => ({ affectedRows: 2, value: "unsafe" }),
    })).rejects.toThrow("zero or one row");
  });

  it("returns one-row versioned mutation values and preserves the explicit expected version", async () => {
    const result = await executeVersionedMutation({
      expectedVersion: 7,
      conflictCode: "wallet.version_conflict",
      conflictMessage: "wallet changed",
      execute: async (input) => ({ affectedRows: 1, value: input.expectedVersion + 1 }),
    });
    expect(result).toEqual({ ok: true, value: 8 });
  });

  it("requires auditable raw SQL ownership and rationale", async () => {
    expect(() => defineRawSql({ owner: "Wallets", reason: "too short", execute: async () => 1 })).toThrow();
    const query = defineRawSql({
      owner: "wallets",
      reason: "PostgreSQL recursive traversal is not expressible by the Drizzle builder.",
      execute: async () => 42,
    });
    await expect(query.execute()).resolves.toBe(42);
    expect(Object.isFrozen(query)).toBe(true);
  });
});
