import { and, asc, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { pagePolicy, toPage } from "@skiesjs/drizzle-postgres";
import { createWalletId } from "./wallet-id.js";
import { wallets } from "./wallet.table.js";
import type { ListWallets } from "./list-wallets.slice.js";

export interface WalletDatabase {
  readonly listWallets: ListWallets;
  close(): Promise<void>;
}

export function openWalletDatabase(databaseUrl: string): WalletDatabase {
  const sql = postgres(databaseUrl, { max: 10 });
  const db = drizzle(sql);
  return {
    listWallets: orderedWalletPage(db),
    close: async () => sql.end(),
  };
}

const walletPagePolicy = pagePolicy({
  owner: "wallets",
  filter: "wallets.active_for_org",
  order: [
    { column: "createdAt", direction: "asc" },
    { column: "id", direction: "asc", unique: true },
  ],
});

interface WalletRow {
  readonly id: string;
  readonly displayName: string;
  readonly createdAt: Date;
}

function orderedWalletPage(db: PostgresJsDatabase): ListWallets {
  return async (request) => {
    const visibleWallet = and(eq(wallets.orgId, request.orgId), eq(wallets.archived, false));
    return toPage<WalletRow, Awaited<ReturnType<ListWallets>>["items"][number]>({
      pageNumber: request.pageNumber,
      pageSize: request.pageSize,
      maxPageSize: 100,
      policy: walletPagePolicy,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      count: async ({ signal, policy }) => {
        signal?.throwIfAborted();
        if (policy !== walletPagePolicy) throw new Error("page policy identity changed");
        return db.$count(wallets, visibleWallet);
      },
      select: async ({ offset, limit, signal, policy }) => {
        signal?.throwIfAborted();
        if (policy !== walletPagePolicy) throw new Error("page policy identity changed");
        return db.select({
          id: wallets.id,
          displayName: wallets.displayName,
          createdAt: wallets.createdAt,
        })
          .from(wallets)
          .where(visibleWallet)
          .orderBy(asc(wallets.createdAt), asc(wallets.id))
          .limit(limit)
          .offset(offset);
      },
      project: (row) => {
        const id = createWalletId(row.id);
        if (!id.ok) throw new TypeError("PostgreSQL returned an invalid wallet UUID");
        return { walletId: id.value, displayName: row.displayName, createdAt: row.createdAt.toISOString() };
      },
    });
  };
}
