import type { ExecuteHostCommandRequest, ExecuteHostCommandResult } from "../../shared/types/ssh-commands";
import type { Env } from "../env";
import { VpsHostRepository } from "../repositories/vps-hosts";
import { validateExecuteHostCommandRequest, type NormalizedExecuteHostCommandRequest } from "../validation/ssh-commands";
import { PasswordCrypto } from "./password-crypto";

export interface SshExecutionRequest {
  hostname: string;
  port: number;
  username: string;
  password: string;
  command: string;
  timeoutMs: number;
}

export type SshCommandExecutor = (request: SshExecutionRequest) => Promise<ExecuteHostCommandResult>;

interface HostCommandDependencies {
  repository?: Pick<VpsHostRepository, "findById">;
  crypto?: Pick<PasswordCrypto, "decrypt">;
  executeSshCommand: SshCommandExecutor;
}

export function createHostCommandExecutor(dependencies: HostCommandDependencies) {
  return async function executeHostCommandWithDependencies(
    env: Env,
    request: ExecuteHostCommandRequest
  ): Promise<ExecuteHostCommandResult> {
    const validation = validateExecuteHostCommandRequest(request);
    if (!validation.ok) throw new Error(validation.message);

    const repository = dependencies.repository ?? new VpsHostRepository(env.DB);
    const host = await repository.findById(validation.value.hostId);
    if (!host) throw new Error("host_not_found");

    const crypto = dependencies.crypto ?? new PasswordCrypto(env.VPS_PASSWORD_KEY);
    const password = await crypto.decrypt(host.password_ciphertext);
    const command = selectCommand(validation.value);

    return dependencies.executeSshCommand({
      hostname: host.address,
      port: host.port,
      username: host.username,
      password,
      command,
      timeoutMs: validation.value.timeoutMs
    });
  };
}

export async function executeHostCommand(env: Env, request: ExecuteHostCommandRequest): Promise<ExecuteHostCommandResult> {
  return createHostCommandExecutor({
    executeSshCommand: (input) => env.ARK_SSH.executeCommand(input)
  })(env, request);
}

function selectCommand(request: NormalizedExecuteHostCommandRequest): string {
  return request.command ?? "echo ok";
}
