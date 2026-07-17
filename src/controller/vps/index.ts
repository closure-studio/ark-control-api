import { API_ERROR_CODES } from "../../constants/api/error-codes";
import type { Env } from "../../schemas/env";
import type { GcpOperationResult } from "../../schemas/gcp/operations";
import type {
  CreateVpsRequest,
  PatchVpsRequest,
  VpsInventoryResponse,
  VpsResource
} from "../../schemas/vps/hosts";
import { loadAccountRow } from "../../services/gcp/accounts";
import { fetchGoogleAccessToken } from "../../services/gcp/auth";
import {
  getProjectInstance,
  submitInstanceAction,
  waitForZoneOperation
} from "../../services/gcp/compute";
import {
  DEFAULT_VPS_SSH_PASSWORD,
  DEFAULT_VPS_SSH_USERNAME
} from "../../services/gcp/startup-script";
import { createDefaultVps } from "../../services/gcp/operations";
import { VpsHostRepository, type VpsHostRecord } from "../../repositories/vps/vps-hosts";
import { executeHostCommand } from "../../services/vps/host-command-executor";
import { PasswordCrypto } from "../../services/vps/password-crypto";
import { ControlApiError } from "../../errors/control-api";

type VpsServiceOptions = {
  fetcher?: typeof fetch;
  operationPollDelayMs?: number;
};

type ProvisionedInstanceIdentity = {
  accountId: number;
  projectId: string;
  zone: string;
  instanceName: string;
};

function toResource(host: VpsHostRecord): VpsResource {
  return {
    id: host.id,
    name: host.name,
    address: host.address,
    port: host.port,
    username: host.username,
    watcherEnabled: host.enabled,
    createdAt: host.created_at,
    updatedAt: host.updated_at
  };
}

export async function listVpsResources(env: Env): Promise<VpsInventoryResponse> {
  const hosts = await new VpsHostRepository(env.DB).listAll();
  return { vps: hosts.map(toResource) };
}

export async function getVpsResource(env: Env, hostId: number): Promise<VpsResource> {
  const host = await new VpsHostRepository(env.DB).findById(hostId);
  if (!host) throw new ControlApiError(API_ERROR_CODES.NOT_FOUND, "VPS was not found.", 404);
  return toResource(host);
}

export async function verifyVps(env: Env, hostId: number) {
  return executeHostCommand(env, { hostId });
}

export async function createManualVps(
  env: Env,
  input: CreateVpsRequest
): Promise<VpsResource> {
  const { enabled, ...hostInput } = input;
  const password = await new PasswordCrypto(env.VPS_PASSWORD_KEY).encrypt(hostInput.password);
  const host = await new VpsHostRepository(env.DB).create(hostInput, password, enabled);
  if (!host) {
    throw new ControlApiError(API_ERROR_CODES.INTERNAL_ERROR, "Unable to create VPS.", 500);
  }
  return toResource(host);
}

export async function updateVps(
  env: Env,
  hostId: number,
  input: PatchVpsRequest
): Promise<VpsResource> {
  const repository = new VpsHostRepository(env.DB);
  if (!(await repository.findById(hostId))) {
    throw new ControlApiError(API_ERROR_CODES.NOT_FOUND, "VPS was not found.", 404);
  }
  const passwordCiphertext =
    input.password === undefined
      ? undefined
      : await new PasswordCrypto(env.VPS_PASSWORD_KEY).encrypt(input.password);
  const updated = await repository.patch(hostId, input, passwordCiphertext);
  if (!updated) {
    throw new ControlApiError(API_ERROR_CODES.NOT_FOUND, "VPS was not found.", 404);
  }
  return toResource(updated);
}

async function compensateCreatedInstance(
  env: Env,
  identity: ProvisionedInstanceIdentity,
  options: VpsServiceOptions
): Promise<string | null> {
  try {
    const account = await loadAccountRow(env, identity.accountId);
    const fetcher = options.fetcher ?? fetch;
    const accessToken = await fetchGoogleAccessToken(env, account, { fetch: fetcher });
    const operationName = await submitInstanceAction({
      fetcher,
      accessToken,
      projectId: identity.projectId,
      zone: identity.zone,
      instanceName: identity.instanceName,
      action: "delete"
    });
    if (operationName) {
      await waitForZoneOperation({
        fetcher,
        accessToken,
        projectId: identity.projectId,
        zone: identity.zone,
        operationName,
        delayMs: options.operationPollDelayMs ?? 1_500
      });
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Compensating VM deletion failed.";
  }
}

export async function provisionGcpVps(
  env: Env,
  accountId: number,
  workerBaseUrl: string,
  options: VpsServiceOptions = {}
): Promise<{ vps: VpsResource; operation: GcpOperationResult }> {
  const fetcher = options.fetcher ?? fetch;
  const operation = await createDefaultVps(env, accountId, {
    fetch: fetcher,
    ...(options.operationPollDelayMs !== undefined
      ? { operationPollDelayMs: options.operationPollDelayMs }
      : {}),
    workerBaseUrl
  });
  if (operation.status !== "succeeded") {
    throw new ControlApiError(
      API_ERROR_CODES.VPS_CLOUD_CREATE_FAILED,
      operation.message ?? "Unable to create GCP VPS.",
      502,
      { operation }
    );
  }

  const identity: ProvisionedInstanceIdentity = {
    accountId,
    projectId: operation.projectId,
    zone: operation.zone,
    instanceName: operation.instanceName
  };

  try {
    const account = await loadAccountRow(env, accountId);
    const accessToken = await fetchGoogleAccessToken(env, account, { fetch: fetcher });
    const instance = await getProjectInstance({
      fetcher,
      accessToken,
      accountId,
      accountName: account.name,
      projectId: identity.projectId,
      zone: identity.zone,
      instanceName: identity.instanceName
    });
    const address = instance.externalIps[0];
    if (!address) throw new Error("The new GCP VPS does not have an external IP address.");

    const passwordCiphertext = await new PasswordCrypto(env.VPS_PASSWORD_KEY).encrypt(
      DEFAULT_VPS_SSH_PASSWORD
    );
    const host = await new VpsHostRepository(env.DB).create(
      {
        name: identity.instanceName,
        address,
        port: 22,
        username: DEFAULT_VPS_SSH_USERNAME,
        password: DEFAULT_VPS_SSH_PASSWORD
      },
      passwordCiphertext
    );
    if (!host) throw new Error("Unable to save the new VPS host.");
    return { vps: toResource(host), operation };
  } catch (error) {
    const compensationError = await compensateCreatedInstance(env, identity, options);
    if (compensationError) console.error("GCP VPS compensation failed", { identity, compensationError });
    throw new ControlApiError(
      API_ERROR_CODES.VPS_HOST_REGISTRATION_FAILED,
      error instanceof Error ? error.message : "Unable to register the new VPS host.",
      502,
      { identity, compensationError }
    );
  }
}

export async function deleteVps(
  env: Env,
  hostId: number
): Promise<{ id: number; name: string; deleted: true }> {
  const repository = new VpsHostRepository(env.DB);
  const host = await repository.findById(hostId);
  if (!host) return { id: hostId, name: `VPS ${hostId}`, deleted: true };
  await repository.delete(host.id);
  return { id: host.id, name: host.name, deleted: true };
}
