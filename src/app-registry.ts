import type { PlainMessage, SlashCommand } from "@towns-protocol/proto";
import {
  AppRegistryService,
  makeSignerContextFromBearerToken,
  parseAppPrivateData,
  townsEnv,
} from "@towns-protocol/sdk";
import { hexToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const updateCommands = async (
  appPrivateData: string,
  bearerToken: string,
  commands: PlainMessage<SlashCommand>[]
) => {
  const { privateKey, env } = parseAppPrivateData(appPrivateData);
  const { address: appClientAddress } = privateKeyToAccount(
    privateKey as `0x${string}`
  );
  const signerContext = await makeSignerContextFromBearerToken(bearerToken);
  const appRegistryUrl = townsEnv().getAppRegistryUrl(env);
  const { appRegistryRpcClient } = await AppRegistryService.authenticate(
    signerContext,
    appRegistryUrl
  );
  await appRegistryRpcClient.updateAppMetadata({
    appId: hexToBytes(appClientAddress),
    updateMask: ["slash_commands"],
    metadata: {
      slashCommands: commands,
    },
  });
};
