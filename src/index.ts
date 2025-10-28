import { makeTownsBot } from "@towns-protocol/bot";
import { Hono } from "hono";
import { logger } from "hono/logger";
import commands, { dummyCommands } from "./commands";
import * as queries from "./db/queries";
import { parseAppPrivateData } from "@towns-protocol/sdk";
import { getBalance } from "viem/actions";
import { parseEther } from "viem";

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
    await handler.sendMessage(
      channelId,
      "Commands: /help, /ping, /joke /tip /healthcheck\n\nPlease test them all ❤️"
    );
  });

  dummybot.onSlashCommand(
    "ping",
    async (handler, { channelId, createdAt, eventId }) => {
      const latency = Date.now() - createdAt.getTime();
      await handler.sendMessage(channelId, `Pong! (${latency}ms)`, {
        replyId: eventId,
      });
    }
  );

  dummybot.onSlashCommand(
    "joke",
    async (handler, { channelId, eventId, threadId }) => {
      const { joke } = await fetch("https://icanhazdadjoke.com/", {
        headers: {
          Accept: "application/json",
        },
      }).then((res) => res.json() as Promise<{ joke: string }>);
      await handler.sendMessage(channelId, joke, {
        replyId: eventId,
        threadId,
      });
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
  const requiredBalanceToPayForGas = parseEther("0.0001");

  // userId -> eventId
  const map = new Map<string, string>();
  dummybot.onSlashCommand(
    "tip",
    async (handler, { channelId, userId, eventId }) => {
      const balance = await getBalance(dummybot.viem, {
        address: dummybot.botId as `0x${string}`,
      });
      if (balance < requiredBalanceToPayForGas) {
        await handler.sendMessage(
          channelId,
          "Please send me some ETH to pay for gas 😁 (use my protocol user id: `" +
            dummybot.botId +
            "`). Call `/tip` again after sending the ETH.",
          { replyId: eventId }
        );
        return;
      }
      await handler.sendMessage(
        channelId,
        "Tip this message and I'll tip it back! 😊",
        { replyId: eventId }
      );
      map.set(userId, eventId);
    }
  );

  dummybot.onTip(
    async (
      handler,
      { channelId, userId, amount, senderAddress, receiverAddress }
    ) => {
      if (receiverAddress !== dummybot.appAddress) {
        return;
      }
      if (!map.has(userId)) {
        return;
      }
      const eventId = map.get(userId)!;
      const tx = await handler.sendTip({
        channelId,
        receiverUserId: userId,
        amount,
        receiver: senderAddress,
        messageId: eventId,
      });
      await handler.sendMessage(
        channelId,
        "It was a pleasure doing business with you! 😊\n\nTx Receipt: https://base-sepolia.blockscout.com/tx/" +
          tx.txHash,
        { replyId: eventId }
      );
    }
  );

  const instance = {
    bot: dummybot,
    jwtMiddleware,
    handler,
    channelIds: channelIds || [],
  } satisfies BotInstance;
  botCache.set(appAddress, instance);

  return instance;
}

botfather.onSlashCommand(
  "setup",
  async (handler, { channelId, args, eventId }) => {
    const [appPrivateData, jwtSecret] = args;
    if (!appPrivateData || !jwtSecret) {
      await handler.sendMessage(
        channelId,
        "Usage: /setup <APP_PRIVATE_DATA> <JWT_SECRET>",
        { replyId: eventId }
      );
      return;
    }

    try {
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
        `✅ Bot setup complete!\n\nWebhook URL: \`${webhookUrl}\``,
        { replyId: eventId }
      );
    } catch (error) {
      await handler.sendMessage(
        channelId,
        "❌ Invalid app private data format. Can you check if you're using the correct credentials?",
        { replyId: eventId }
      );
    }
  }
);

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
  const middlewareResult = await jwtMiddleware(c, async () => {
    result = await handler(c);
  });

  // If middleware returned a response (e.g., auth failure), return it
  if (middlewareResult) {
    return middlewareResult;
  }

  return result;
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
