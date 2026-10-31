import { VpsHostRepository } from "../../repositories/vps/vps-hosts";
import type { Env } from "../../schemas/env";
import type { ServiceVpsHost } from "../../schemas/vps/hosts";
import type { ExecuteHostCommandResult } from "../../schemas/vps/ssh-command";
import { executeHostCommand as executeManagedHostCommand } from "../vps/host-command-executor";

export async function listVpsHosts(env: Env): Promise<ServiceVpsHost[]> {
  const hosts = await new VpsHostRepository(env.DB).listEnabledByRole("redroid");
  return hosts.filter((host) => host.address !== env.COMPATIBILITY_TEST_HOST_ADDRESS);
}

export async function executeHostCommand(
  env: Env,
  hostId: number,
  command: string,
  timeoutMs = 60_000
): Promise<ExecuteHostCommandResult> {
  return await executeManagedHostCommand(env, { hostId, command, timeoutMs });
}
