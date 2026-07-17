import { VpsHostRepository } from "../../repositories/vps/vps-hosts";
import type { Env } from "../../types/env";
import type { ExecuteHostCommandResult, ServiceVpsHost } from "../../types/watcher";
import { executeHostCommand as executeManagedHostCommand } from "../vps/host-command-executor";

export async function listVpsHosts(env: Env): Promise<ServiceVpsHost[]> {
  return await new VpsHostRepository(env.DB).listEnabled();
}

export async function executeHostCommand(
  env: Env,
  hostId: number,
  command: string,
  timeoutMs = 60_000,
): Promise<ExecuteHostCommandResult> {
  return await executeManagedHostCommand(env, { hostId, command, timeoutMs });
}
