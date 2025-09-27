import { makeTownsBot } from "@towns-protocol/bot";
import { Hono } from "hono";
import { logger } from "hono/logger";
import commands from "./commands";
import {
  getService,
  isDeployCompleted,
  isDeployInProgress,
  triggerDeploy,
  updateEnv,
  waitForDeploy,
} from "./render";

const bot = await makeTownsBot(
  process.env.APP_PRIVATE_DATA!,
  process.env.JWT_SECRET!,
  {
    commands,
  }
);

let inProgress = false;

bot.onSlashCommand("setup", async (handler, { channelId, args }) => {
  if (inProgress) {
    await handler.sendMessage(channelId, "Setup already in progress.");
    return;
  }
  const [appPrivateData, jwtSecret] = args;
  if (!appPrivateData || !jwtSecret) {
    await handler.sendMessage(
      channelId,
      "Usage: /setup <APP_PRIVATE_DATA> <JWT_SECRET>"
    );
    return;
  }
  inProgress = true;
  const { eventId } = await handler.sendMessage(channelId, "Setup started...");
  console.log("will update env");
  await updateEnv(process.env.RENDER_BOT_SERVICE_ID!, {
    APP_PRIVATE_DATA: appPrivateData,
    JWT_SECRET: jwtSecret,
  });
  console.log("updated env");
  await handler.editMessage(channelId, eventId, "Deploying...");
  console.log("will trigger deploy");
  const { id: deployId } = await triggerDeploy(
    process.env.RENDER_BOT_SERVICE_ID!
  );
  console.log("triggered deploy");
  await waitForDeploy(
    process.env.RENDER_BOT_SERVICE_ID!,
    deployId,
    async (status) => {
      console.log("deploy status changed", status);
      const emoji = isDeployInProgress(status)
        ? "🔄"
        : isDeployCompleted(status)
        ? "✅"
        : "❌";
      await handler.editMessage(
        channelId,
        eventId,
        `${emoji} Deploy status: \`${status}\``
      );
    }
  );
  console.log("deploy completed");
  const {
    serviceDetails: { url },
  } = await getService(process.env.RENDER_BOT_SERVICE_ID!);
  console.log("will edit message");
  await handler.editMessage(
    channelId,
    eventId,
    `Setup completed. You can use \`${url}/webhook\` to finish your bot setup and receive events.`
  );
  inProgress = false;
});

const { jwtMiddleware, handler } = await bot.start();

const app = new Hono();

app.use(logger());
app.post("/webhook", jwtMiddleware, handler);

export default app;
