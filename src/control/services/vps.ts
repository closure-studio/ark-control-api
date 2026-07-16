import type { GcpOperationResult } from "../../gcp/shared/api";
import { loadAccountRow } from "../../gcp/worker/services/gcp/accounts";
import { fetchGoogleAccessToken } from "../../gcp/worker/services/gcp/auth";
import {
  getProjectInstance,
  submitInstanceAction,
  waitForZoneOperation
} from "../../gcp/worker/services/gcp/compute";
import {
  DEFAULT_VPS_SSH_PASSWORD,
  DEFAULT_VPS_SSH_USERNAME
} from "../../gcp/worker/services/gcp/constants";
import { createDefaultVps } from "../../gcp/worker/services/gcp/operations";
import type { Env } from "../../env";
import type { CreateVpsHostRequest, PatchVpsHostRequest } from "../../vps/shared/types/vps-hosts";
import { VpsHostRepository, type VpsHostRecord } from "../../vps/worker/repositories/vps-hosts";
import { PasswordCrypto } from "../../vps/worker/services/password-crypto";
import { ControlApiError } from "../errors";
import type { VpsInventoryResponse, VpsResource } from "../types";

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
  if (!host) throw new ControlApiError("not_found", "VPS was not found.", 404);
  return toResource(host);
}

export async function createManualVps(
  env: Env,
  input: Required<CreateVpsHostRequest>
): Promise<VpsResource> {
  const password = await new PasswordCrypto(env.VPS_PASSWORD_KEY).encrypt(input.password);
  const host = await new VpsHostRepository(env.DB).create(input, password);
  if (!host) throw new ControlApiError("internal_error", "Unable to create VPS.", 500);
  return toResource(host);
}

export async function updateVps(
  env: Env,
  hostId: number,
  input: PatchVpsHostRequest
): Promise<VpsResource> {
  const repository = new VpsHostRepository(env.DB);
  if (!(await repository.findById(hostId))) {
    throw new ControlApiError("not_found", "VPS was not found.", 404);
  }
  const passwordCiphertext =
    input.password === undefined
      ? undefined
      : await new PasswordCrypto(env.VPS_PASSWORD_KEY).encrypt(input.password);
  const updated = await repository.patch(hostId, input, passwordCiphertext);
  if (!updated) throw new ControlApiError("not_found", "VPS was not found.", 404);
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
    operationPollDelayMs: options.operationPollDelayMs,
    workerBaseUrl
  });
  if (operation.status !== "succeeded") {
    throw new ControlApiError(
      "cloud_create_failed",
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
      "host_registration_failed",
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
