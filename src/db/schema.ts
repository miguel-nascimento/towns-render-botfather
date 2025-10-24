import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const botTable = sqliteTable("bots", {
  appAddress: text("app_address").primaryKey(),
  appPrivateData: text("app_private_data").notNull(),
  jwtSecret: text("jwt_secret").notNull(),
  createdAt: text("created_at")
    .default(sql`(CURRENT_TIMESTAMP)`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
    () => new Date()
  ),
  channelIds: text("channel_ids", { mode: "json" })
    .$type<string[]>()
    .default([]),
});

export type InsertBot = typeof botTable.$inferInsert;
export type SelectBot = typeof botTable.$inferSelect;
