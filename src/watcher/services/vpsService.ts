import type { Env, ExecuteHostCommandResult, ServiceVpsHost } from "../types";
import { executeHostCommand as executeManagedHostCommand } from "../../vps/worker/services/host-command-executor";
import { VpsHostRepository } from "../../vps/worker/repositories/vps-hosts";

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
