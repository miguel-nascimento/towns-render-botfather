import { eq } from "drizzle-orm";
import { db } from ".";
import { botTable, type InsertBot } from "./schema";

export const getBot = async (clientAddress: string) =>
  await db
    .select()
    .from(botTable)
    .where(eq(botTable.clientAddress, clientAddress))
    .limit(1)
    .get();

export const createBot = async (bot: InsertBot) =>
  await db
    .insert(botTable)
    .values(bot)
    .onConflictDoUpdate({
      target: botTable.clientAddress,
      set: {
        ...bot,
        createdAt: undefined, // do not overwrite createdAt
      },
    });
