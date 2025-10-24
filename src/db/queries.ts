import { eq } from "drizzle-orm";
import { db } from ".";
import { botTable, type InsertBot } from "./schema";

export const getBot = async (appAddress: string) =>
  await db
    .select()
    .from(botTable)
    .where(eq(botTable.appAddress, appAddress))
    .limit(1)
    .get();

export const createBot = async (bot: InsertBot) =>
  await db
    .insert(botTable)
    .values(bot)
    .onConflictDoUpdate({
      target: botTable.appAddress,
      set: {
        ...bot,
        createdAt: undefined, // do not overwrite createdAt
      },
    });

export const updateBot = async (
  appAddress: string,
  updates: Partial<InsertBot>
) =>
  await db
    .update(botTable)
    .set(updates)
    .where(eq(botTable.appAddress, appAddress));
