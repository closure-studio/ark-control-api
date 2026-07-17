import type { Env } from "../../schemas/env";
import { VpsHostRepository } from "../../repositories/vps/vps-hosts";
import * as v from "valibot";
import {
  NormalizedExecuteHostCommandRequestSchema,
  type ExecuteHostCommandRequest,
  type ExecuteHostCommandResult,
  type NormalizedExecuteHostCommandRequest
} from "../../schemas/vps/ssh-command";
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
    const validation = v.safeParse(NormalizedExecuteHostCommandRequestSchema, request);
    if (!validation.success) throw new Error(validation.issues[0].message);

    const repository = dependencies.repository ?? new VpsHostRepository(env.DB);
    const host = await repository.findById(validation.output.hostId);
    if (!host) throw new Error("host_not_found");

    const crypto = dependencies.crypto ?? new PasswordCrypto(env.VPS_PASSWORD_KEY);
    const password = await crypto.decrypt(host.password_ciphertext);
    const command = selectCommand(validation.output);

    return dependencies.executeSshCommand({
      hostname: host.address,
      port: host.port,
      username: host.username,
      password,
      command,
      timeoutMs: validation.output.timeoutMs
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
