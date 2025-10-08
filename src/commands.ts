import type { PlainMessage, SlashCommand } from "@towns-protocol/proto";

// To update the slash command list, you can add entries here and run the following command:
// npx towns-bot update-commands src/commands.ts <your-bearer-token>
const commands = [
  {
    name: "setup",
    description:
      "Usage: <APP_PRIVATE_DATA> <JWT_SECRET> (optional: <BEARER_TOKEN>)",
  },
  {
    name: "setcommands",
    description: "Usage: <APP_PRIVATE_DATA> <BEARER_TOKEN>",
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
] as const satisfies PlainMessage<SlashCommand>[];
export default commands;
