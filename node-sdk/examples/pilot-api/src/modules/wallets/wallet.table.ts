import { boolean, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id").notNull(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  archived: boolean("archived").notNull().default(false),
});
