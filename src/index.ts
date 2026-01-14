import { makeTownsBot, type BotHandler } from "@towns-protocol/bot";
import { Hono, type Context } from "hono";
import { logger } from "hono/logger";
import commands, { dummyCommands } from "./commands";
import * as queries from "./db/queries";
import { parseAppPrivateData } from "@towns-protocol/sdk";
import { getBalance } from "viem/actions";
import { parseEther } from "viem";
import { Permission } from "@towns-protocol/web3";

const botfather = await makeTownsBot(
  process.env.APP_PRIVATE_DATA!,
  process.env.JWT_SECRET!,
  {
    commands,
  }
);

type BotInstance = {
  bot: Awaited<ReturnType<typeof makeTownsBot>>;
  app: Hono;
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
      "Commands: /help, /ping, /joke /tip /healthcheck /createChannel\n\nPlease test them all ❤️"
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
      console.log("onTip", {
        channelId,
        userId,
        amount,
        senderAddress,
        receiverAddress,
      });
      if (receiverAddress !== dummybot.appAddress) {
        return;
      }
      if (!map.has(userId)) {
        console.log("onTip: userId not found in map", userId);
        return;
      }

      const eventId = map.get(userId)!;
      console.log("onTip: eventId", eventId);
      const tx = await sendTipWithRetry(
        handler,
        userId, // Use Towns userId, not wallet senderAddress
        eventId,
        channelId,
        amount
      );
      console.log("onTip: tx", tx);
      // const tx = await handler.sendTip({
      //   channelId,
      //   userId,
      //   amount,
      //   messageId: eventId,
      // });

      if (tx) {
        console.log("onTip: sending message", {
          channelId,
          eventId,
          txHash: tx.txHash,
        });
        await handler.sendMessage(
          channelId,
          "It was a pleasure doing business with you! 😊\n\nTx Receipt: https://base-sepolia.blockscout.com/tx/" +
            tx.txHash,
          { replyId: eventId }
        );
      }
    }
  );

  dummybot.onSlashCommand(
    "createChannel",
    async (handler, { spaceId, channelId, args, eventId, isDm }) => {
      if (isDm) {
        await handler.sendMessage(
          channelId,
          "This command is not available in DMs."
        );
        return;
      }
      const channelName = args.join(" ");
      if (!channelName) {
        await handler.sendMessage(
          channelId,
          "Usage: /createChannel <channelName>",
          { replyId: eventId }
        );
      }
      try {
        const createdChannelId = await handler.createChannel(spaceId, {
          name: channelName,
        });
        await handler.sendMessage(
          channelId,
          "Channel created successfully! 🎉\n\nChannel ID: " + createdChannelId,
          { replyId: eventId }
        );
      } catch (error) {
        const { eventId: errorEventId } = await handler.sendMessage(
          channelId,
          "Failed to create channel. I will send the error in thread, but can you make sure my gas wallet is funded and that I have the CreateChannel permission? Thanks for testing! 😇\n"
        );
        await handler.sendMessage(channelId, `${(error as Error).message}\n`, {
          threadId: errorEventId,
        });
      }
    }
  );

  dummybot.onSlashCommand(
    "createrole",
    async (handler, { spaceId, channelId, args, mentions, eventId, isDm }) => {
      if (isDm) {
        await handler.sendMessage(
          channelId,
          "This command is not available in DMs."
        );
        return;
      }
      const roleName = args[0];
      if (!roleName) {
        await handler.sendMessage(
          channelId,
          "Usage: /createrole <roleName> [@mention users]",
          { replyId: eventId }
        );
        return;
      }
      try {
        const users = (mentions || []).map((m) => m.userId);
        const { roleId } = await dummybot.createRole(spaceId, {
          name: roleName,
          permissions: [Permission.Read, Permission.Write],
          users: users.length ? users : undefined,
        });
        await handler.sendMessage(
          channelId,
          `Role created: ${roleName}\nRole ID: ${roleId}`,
          { replyId: eventId }
        );
      } catch (error) {
        const { eventId: errId } = await handler.sendMessage(
          channelId,
          "Failed to create role.",
          { replyId: eventId }
        );
        await handler.sendMessage(channelId, `${(error as Error).message}`, {
          threadId: errId,
        });
      }
    }
  );

  dummybot.onSlashCommand(
    "listallroles",
    async (handler, { spaceId, channelId, eventId, isDm }) => {
      if (isDm) {
        await handler.sendMessage(
          channelId,
          "This command is not available in DMs."
        );
        return;
      }
      try {
        const roles = await dummybot.getAllRoles(spaceId);
        if (!roles?.length) {
          await handler.sendMessage(channelId, "No roles found.", {
            replyId: eventId,
          });
          return;
        }
        const lines = roles.map((r) => `- ${r.name} (ID: ${r.id})`).join("\n");
        await handler.sendMessage(channelId, `Roles:\n${lines}`, {
          replyId: eventId,
        });
      } catch (error) {
        const { eventId: errId } = await handler.sendMessage(
          channelId,
          "Failed to list roles.",
          { replyId: eventId }
        );
        await handler.sendMessage(channelId, `${(error as Error).message}`, {
          threadId: errId,
        });
      }
    }
  );

  dummybot.onSlashCommand(
    "getrole",
    async (handler, { spaceId, channelId, args, eventId, isDm }) => {
      if (isDm) {
        await handler.sendMessage(
          channelId,
          "This command is not available in DMs."
        );
        return;
      }
      const roleId = args[0];
      if (!roleId) {
        await handler.sendMessage(channelId, "Usage: /getrole <roleId>", {
          replyId: eventId,
        });
        return;
      }
      try {
        const role = await dummybot.getRole(spaceId, Number(roleId));
        if (!role) {
          await handler.sendMessage(channelId, "Role not found.", {
            replyId: eventId,
          });
          return;
        }
        const permissions =
          role.permissions && role.permissions.length
            ? role.permissions.join(", ")
            : "none";
        const users =
          (role as any).users && (role as any).users.length
            ? (role as any).users.join(", ")
            : "none";
        await handler.sendMessage(
          channelId,
          `Role: ${role.name}\nID: ${role.id}\nPermissions: ${permissions}\nUsers: ${users}`,
          { replyId: eventId }
        );
      } catch (error) {
        const { eventId: errId } = await handler.sendMessage(
          channelId,
          "Failed to get role.",
          { replyId: eventId }
        );
        await handler.sendMessage(channelId, `${(error as Error).message}`, {
          threadId: errId,
        });
      }
    }
  );

  dummybot.onSlashCommand(
    "deleterole",
    async (handler, { spaceId, channelId, args, eventId, isDm }) => {
      if (isDm) {
        await handler.sendMessage(
          channelId,
          "This command is not available in DMs."
        );
        return;
      }

      const roleId = args[0];
      if (!roleId) {
        await handler.sendMessage(channelId, "Usage: /deleterole <roleId>", {
          replyId: eventId,
        });
        return;
      }
      try {
        const txHash = await dummybot.deleteRole(spaceId, Number(roleId));
        await handler.sendMessage(
          channelId,
          `Role delete submitted.\nTx: ${txHash}`,
          { replyId: eventId }
        );
      } catch (error) {
        const { eventId: errId } = await handler.sendMessage(
          channelId,
          "Failed to delete role.",
          { replyId: eventId }
        );
        await handler.sendMessage(channelId, `${(error as Error).message}`, {
          threadId: errId,
        });
      }
    }
  );

  // Helper function to send tip using handler.sendTip() (per Towns Protocol docs)
  async function sendTipWithRetry(
    handler: BotHandler,
    to: string,
    messageId: string,
    channelId: string,
    amount: bigint,
    maxRetries = 3
  ) {
    const amountEth = Number(amount) / 1e18;

    // Check balances for both wallets (per Towns Protocol docs)
    // Gas wallet (bot.botId) needs Base ETH for gas fees
    // Bot treasury (bot.appAddress) needs ETH to send as tips
    try {
      const appBalance = await getBalance(dummybot.viem, {
        address: dummybot.appAddress,
      });
      const botIdBalance = await getBalance(dummybot.viem, {
        address: dummybot.botId as `0x${string}`,
      });
      console.log(
        `Bot appAddress (treasury) balance: ${(
          Number(appBalance) / 1e18
        ).toFixed(6)} ETH`
      );
      console.log(
        `Bot botId (gas wallet) balance: ${(
          Number(botIdBalance) / 1e18
        ).toFixed(6)} ETH`
      );
      console.log(`Required payout: ${amountEth.toFixed(6)} ETH`);

      if (appBalance < amount) {
        console.error(
          `Insufficient balance in appAddress! Have ${(
            Number(appBalance) / 1e18
          ).toFixed(6)} ETH, need ${amountEth.toFixed(6)} ETH`
        );
        return false;
      }

      if (botIdBalance === BigInt(0)) {
        console.warn(
          `Warning: botId (gas wallet) has no balance! Gas fees may fail.`
        );
      }
    } catch (error) {
      console.error("Error checking balances:", error);
      return false;
    }

    // Use handler.sendTip() per Towns Protocol docs
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `Sending tip attempt ${attempt}/${maxRetries} (handler.sendTip):
  ${amountEth.toFixed(6)} ETH to ${to}`
        );

        // Use handler.sendTip() per current Towns Protocol documentation:
        // await handler.sendTip({ userId, amount, messageId, channelId, currency? })
        const result = await handler.sendTip({
          userId: to as `0x${string}`,
          amount,
          messageId,
          channelId,
          // currency omitted -> defaults to ETH
        });

        console.log(
          `Tip sent successfully via handler.sendTip()! Amount: ${amountEth.toFixed(
            6
          )}
   ETH, tx/event:`,
          result
        );
        return result;
      } catch (error: any) {
        console.error(
          `handler.sendTip attempt ${attempt}/${maxRetries} failed:`,
          error?.message || error
        );

        if (attempt === maxRetries) {
          console.error(
            "All handler.sendTip attempts failed. Possible reasons:"
          );
          console.error("1. Insufficient balance in bot.appAddress (treasury)");
          console.error("2. Insufficient gas in bot.botId (gas wallet)");
          console.error("3. Network/connectivity issues");
          console.error(
            "4. Invalid parameters (to/userId, messageId, channelId)"
          );
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    return null;
  }

  dummybot.onSlashCommand(
    "pin",
    async (handler, { channelId, eventId, event }) => {
      await handler.sendMessage(
        channelId,
        `Pinning the message: \`${eventId}\``,
        {
          replyId: eventId,
        }
      );
      await handler.pinMessage(channelId, eventId, event);
    }
  );
  dummybot.onSlashCommand(
    "unpin",
    async (handler, { channelId, eventId, args }) => {
      const pinEventId = args[0];
      if (!pinEventId) {
        await handler.sendMessage(channelId, "Usage: /unpin <eventId>", {
          replyId: eventId,
        });
        return;
      }
      await handler.sendMessage(channelId, "Unpinning a message", {
        replyId: eventId,
      });
      await handler.unpinMessage(channelId, pinEventId);
    }
  );

  dummybot.onSlashCommand(
    "miniapp",
    async (handler, { channelId, eventId }) => {
      await handler.sendMessage(channelId, "here's bankr for you!", {
        replyId: eventId,
        attachments: [
          {
            type: "miniapp",
            url: "https://bankr.bot/",
          },
        ],
      });
    }
  );

  dummybot.onSlashCommand("thread", async (handler, { channelId, eventId }) => {
    await handler.sendMessage(
      channelId,
      "As my magic spell cast, a thread is created! 🪄✨",
      {
        threadId: eventId,
      }
    );
  });

  const botApp = dummybot.start();

  const instance = {
    bot: dummybot,
    app: botApp,
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
const app = new Hono();

app.route("/", botfather.start());

const forwardToBotApp = async (
  c: Context,
  appAddress: string,
  pathPrefix: string
) => {
  const instance = await getBotInstance(appAddress);
  if (!instance) {
    return c.json({ success: false, error: "Bot not found" }, 404);
  }

  const path = c.req.path.replace(pathPrefix, "");
  const url = new URL(c.req.url);
  url.pathname = path || "/";

  const request = new Request(url, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  });

  return instance.app.fetch(request);
};

const handleHealthCheck = async (c: Context, appAddress: string) => {
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
};

app.get("/bot/:appAddress/health", async (c) => {
  const { appAddress } = c.req.param();
  return handleHealthCheck(c, appAddress);
});

app.get("/webhook/:appAddress/health", async (c) => {
  const { appAddress } = c.req.param();
  return handleHealthCheck(c, appAddress);
});

app.post("/webhook/:appAddress", async (c) => {
  const { appAddress } = c.req.param();
  const instance = await getBotInstance(appAddress);
  if (!instance) {
    return c.json({ success: false, error: "Bot not found" }, 404);
  }

  const url = new URL(c.req.url);
  url.pathname = "/webhook";

  const request = new Request(url, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  });

  return instance.app.fetch(request);
});

app.all("/bot/:appAddress/*", async (c) => {
  const { appAddress } = c.req.param();
  return forwardToBotApp(c, appAddress, `/bot/${appAddress}`);
});

export default app;
