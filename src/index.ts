import { makeTownsBot } from "@towns-protocol/bot";
import { Hono } from "hono";
import { logger } from "hono/logger";
import commands, { dummyCommands } from "./commands";
import * as queries from "./db/queries";
import { parseAppPrivateData } from "@towns-protocol/sdk";

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
  channelIds: string[];
};

const botCache = new Map<string, BotInstance>();

async function getBotInstance(appAddress: string): Promise<BotInstance | null> {
  if (botCache.has(appAddress)) {
    return botCache.get(appAddress)!;
  }
  const data = await queries.getBot(appAddress);
  if (!data) {
    return null;
  }
  const { appPrivateData, jwtSecret, channelIds = [] } = data;
  const dummybot = await makeTownsBot(appPrivateData, jwtSecret, {
    commands: dummyCommands,
  });

  const { jwtMiddleware, handler } = dummybot.start();

  dummybot.onMessage(
    async (handler, { isMentioned, channelId, threadId, eventId }) => {
      if (isMentioned) {
        await handler.sendMessage(channelId, "👀", {
          threadId,
          replyId: eventId,
        });
      }
    }
  );

  dummybot.onSlashCommand("help", async (handler, { channelId }) => {
    await handler.sendMessage(channelId, "Commands: /help, /ping, /joke");
  });

  dummybot.onSlashCommand("ping", async (handler, { channelId, createdAt }) => {
    const latency = Date.now() - createdAt.getTime();
    await handler.sendMessage(channelId, `Pong! (${latency}ms)`);
  });

  dummybot.onSlashCommand(
    "joke",
    async (handler, { channelId, replyId, threadId }) => {
      const { joke } = await fetch("https://icanhazdadjoke.com/", {
        headers: {
          Accept: "application/json",
        },
      }).then((res) => res.json() as Promise<{ joke: string }>);
      await handler.sendMessage(channelId, joke, { replyId, threadId });
    }
  );

  dummybot.onSlashCommand("healthcheck", async (handler, { channelId }) => {
    await queries.updateBot(appAddress, {
      channelIds: [...(channelIds || []), channelId],
    });
    const webhookUrl = `${
      process.env.RENDER_EXTERNAL_URL || "http://localhost:3000"
    }/webhook/${appAddress}/health`;
    await handler.sendMessage(
      channelId,
      `Pleae click on this Health check URL: \`${webhookUrl}\``
    );
  });

  const instance = {
    bot: dummybot,
    jwtMiddleware,
    handler,
    channelIds: channelIds || [],
  } satisfies BotInstance;
  botCache.set(appAddress, instance);

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

  const { appAddress } = parseAppPrivateData(appPrivateData);
  if (!appAddress) {
    throw new Error("Invalid app private data");
  }

  await queries.createBot({
    appAddress,
    appPrivateData,
    jwtSecret,
  });

  const webhookUrl = `${
    process.env.RENDER_EXTERNAL_URL || "http://localhost:3000"
  }/webhook/${appAddress}`;

  await handler.sendMessage(
    channelId,
    `✅ Bot setup complete!\n\nWebhook URL: \`${webhookUrl}\``
  );
});

const { jwtMiddleware, handler } = botfather.start();

const app = new Hono();

app.use(logger());
app.post("/webhook", jwtMiddleware, handler);

app.post("/webhook/:appAddress", async (c) => {
  const { appAddress } = c.req.param();

  const instance = await getBotInstance(appAddress);
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

app.get("/webhook/:appAddress/health", async (c) => {
  const { appAddress } = c.req.param();

  const instance = await getBotInstance(appAddress);
  if (!instance) {
    return c.json({ success: false, error: "Bot not found" }, 404);
  }

  const { bot, channelIds } = instance;

  const promises = channelIds.map((channelId) =>
    bot.sendMessage(channelId, "🟢 Health check passed")
  );

  const results = await Promise.allSettled(promises);

  return c.text(
    `Health check results:\n${results
      .map((result) =>
        result.status === "fulfilled"
          ? "✅"
          : `❌ ${
              result.reason instanceof Error
                ? result.reason.message
                : "Unknown error"
            }`
      )
      .join(", ")}`
  );
});

export default app;
