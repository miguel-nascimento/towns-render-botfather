import { makeTownsBot } from "@towns-protocol/bot";
import { Hono } from "hono";
import { logger } from "hono/logger";
import commands from "./commands";
import * as queries from "./db/queries";
import { parseAppPrivateData } from "@towns-protocol/sdk";
import { privateKeyToAccount } from "viem/accounts";

const botfather = await makeTownsBot(
  process.env.APP_PRIVATE_DATA!,
  process.env.JWT_SECRET!,
  {
    commands,
  }
);

type BotInstance = {
  bot: Awaited<ReturnType<typeof makeTownsBot>>;
  jwtMiddleware: Awaited<
    ReturnType<Awaited<ReturnType<typeof makeTownsBot>>["start"]>
  >["jwtMiddleware"];
  handler: Awaited<
    ReturnType<Awaited<ReturnType<typeof makeTownsBot>>["start"]>
  >["handler"];
};

const botCache = new Map<string, BotInstance>();

async function getBotInstance(
  clientAddress: string
): Promise<BotInstance | null> {
  if (botCache.has(clientAddress)) {
    return botCache.get(clientAddress)!;
  }
  const data = await queries.getBot(clientAddress);
  if (!data) {
    return null;
  }
  const { appPrivateData, jwtSecret } = data;
  const bot = await makeTownsBot(appPrivateData, jwtSecret);
  const { jwtMiddleware, handler } = await bot.start();

  bot.onMessage(
    async (handler, { isMentioned, channelId, threadId, eventId }) => {
      if (isMentioned) {
        await handler.sendMessage(channelId, "👀", {
          threadId,
          replyId: eventId,
        });
      }
    }
  );

  const instance: BotInstance = { bot, jwtMiddleware, handler };
  botCache.set(clientAddress, instance);

  return instance;
}

botfather.onSlashCommand("setup", async (handler, { channelId, args }) => {
  const [appPrivateData, jwtSecret] = args;
  if (!appPrivateData || !jwtSecret) {
    await handler.sendMessage(
      channelId,
      "Usage: /setup <APP_PRIVATE_DATA> <JWT_SECRET>"
    );
    return;
  }

  const { privateKey } = parseAppPrivateData(appPrivateData);
  const { address: clientAddress } = privateKeyToAccount(
    privateKey as `0x${string}`
  );

  await queries.createBot({
    clientAddress,
    appPrivateData,
    jwtSecret,
  });

  const webhookUrl = `${
    process.env.RENDER_EXTERNAL_URL || "http://localhost:3000"
  }/webhook/${clientAddress}`;

  await handler.sendMessage(
    channelId,
    `✅ Bot setup complete!\n\nWebhook URL: \`${webhookUrl}\``
  );
});

const { jwtMiddleware, handler } = await botfather.start();

const app = new Hono();

app.use(logger());
app.post("/webhook", jwtMiddleware, handler);

app.post("/webhook/:clientAddress", async (c) => {
  const { clientAddress } = c.req.param();

  const instance = await getBotInstance(clientAddress);
  if (!instance) {
    return c.json({ success: false, error: "Bot not found" }, 404);
  }

  const { jwtMiddleware, handler } = instance;

  let result: Response | undefined;
  await jwtMiddleware(c, async () => {
    result = await handler(c);
  });

  return result!;
});

export default app;
