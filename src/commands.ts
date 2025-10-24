import type { PlainMessage, SlashCommand } from "@towns-protocol/proto";

const commands = [
  {
    name: "setup",
    description: "Usage: <APP_PRIVATE_DATA> <JWT_SECRET>",
  },
] as const satisfies PlainMessage<SlashCommand>[];

export const dummyCommands = [
  {
    name: "help",
    description: "Show help",
  },
  {
    name: "ping",
    description: "Ping the bot",
  },
  {
    name: "joke",
    description: "Dadjoke",
  },
  {
    name: "healthcheck",
    description: "Gives you a link to the health check URL",
  },
] as const satisfies PlainMessage<SlashCommand>[];
export default commands;
