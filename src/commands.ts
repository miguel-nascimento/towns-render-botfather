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
  {
    name: "tip",
    description: "Tip the bot",
  },
  {
    name: "createrole",
    description:
      "Usage: /createrole <roleName> [mention users to assign initially]",
  },
  {
    name: "listallroles",
    description: "List all roles in this space",
  },
  {
    name: "getrole",
    description: "Usage: /getrole <roleId>",
  },
  {
    name: "deleterole",
    description: "Usage: /deleterole <roleId>",
  },
  {
    name: "createChannel",
    description: "Usage: /createChannel <channelName>",
  },
  {
    name: "pin",
    description:
      "Usage: /pin <eventId> - Pins the message with the given eventId",
  },
  {
    name: "unpin",
    description:
      "Usage: /unpin <eventId> - Unpins the message with the given eventId",
  },
  {
    name: "miniapp",
    description: "Usage: /miniapp - sends a test miniapp",
  },
  {
    name: "thread",
    description:
      "Usage: /thread <message> - Creates a thread with the given message",
  },
] as const satisfies PlainMessage<SlashCommand>[];
export default commands;
