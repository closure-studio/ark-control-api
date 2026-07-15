import type { GcpInstance, GcpInstanceLifecycleAction, GcpOperationResult } from "../../gcp/shared/api";
import { fetchGoogleAccessToken } from "../../gcp/worker/services/gcp/auth";
import { listAccountRows, loadAccountRow } from "../../gcp/worker/services/gcp/accounts";
import {
  getProjectInstance,
  listProjectInstances,
  submitInstanceAction,
  waitForZoneOperation
} from "../../gcp/worker/services/gcp/compute";
import {
  DEFAULT_VPS_SSH_PASSWORD,
  DEFAULT_VPS_SSH_USERNAME
} from "../../gcp/worker/services/gcp/constants";
import { GcpError } from "../../gcp/worker/services/gcp/errors";
import { createDefaultVps, recordOperation } from "../../gcp/worker/services/gcp/operations";
import type { Env } from "../../env";
import type { CreateVpsHostRequest, GcpHostIdentity, PatchVpsHostRequest } from "../../vps/shared/types/vps-hosts";
import { VpsHostRepository, type VpsHostRecord } from "../../vps/worker/repositories/vps-hosts";
import { PasswordCrypto } from "../../vps/worker/services/password-crypto";
import { ControlApiError } from "../errors";
import type { CloudVpsDetails, VpsActionResult, VpsInventoryResponse, VpsResource } from "../types";

type VpsServiceOptions = {
  fetcher?: typeof fetch;
  operationPollDelayMs?: number;
};

type CloudSnapshot = {
  accountName: string;
  instances: Map<string, GcpInstance>;
  error: string | null;
};

function cloudKey(projectId: string, zone: string, instanceName: string): string {
  return `${projectId}\u0000${zone}\u0000${instanceName}`;
}

function cloudIdentity(host: VpsHostRecord): GcpHostIdentity | null {
  if (
    host.gcp_account_id === null ||
    host.gcp_project_id === null ||
    host.gcp_zone === null ||
    host.gcp_instance_name === null
  ) {
    return null;
  }
  return {
    accountId: host.gcp_account_id,
    projectId: host.gcp_project_id,
    zone: host.gcp_zone,
    instanceName: host.gcp_instance_name
  };
}

function toResource(host: VpsHostRecord, snapshot?: CloudSnapshot): VpsResource {
  const identity = cloudIdentity(host);
  let cloud: CloudVpsDetails | null = null;

  if (identity) {
    const instance = snapshot?.instances.get(
      cloudKey(identity.projectId, identity.zone, identity.instanceName)
    );
    cloud = {
      provider: "gcp",
      accountId: identity.accountId,
      accountName: snapshot?.accountName ?? `Account ${identity.accountId}`,
      projectId: identity.projectId,
      zone: identity.zone,
      instanceName: identity.instanceName,
      status: instance?.status ?? null,
      machineType: instance?.machineType ?? null,
      internalIps: instance?.internalIps ?? [],
      externalIps: instance?.externalIps ?? [],
      error: snapshot?.error ?? (instance ? null : "Cloud instance was not found.")
    };
  }

  return {
    id: host.id,
    name: host.name,
    address: host.address,
    port: host.port,
    username: host.username,
    verifyCommand: host.verify_command,
    watcherEnabled: host.enabled === 1,
    source: identity ? "gcp" : "manual",
    cloud,
    createdAt: host.created_at,
    updatedAt: host.updated_at
  };
}

async function loadCloudSnapshots(
  env: Env,
  hosts: VpsHostRecord[],
  options: VpsServiceOptions
): Promise<{ snapshots: Map<number, CloudSnapshot>; errors: VpsInventoryResponse["errors"] }> {
  const fetcher = options.fetcher ?? fetch;
  const referencedIds = new Set(
    hosts.flatMap((host) => (host.gcp_account_id === null ? [] : [host.gcp_account_id]))
  );
  const accountRows = (await listAccountRows(env)).filter((account) => referencedIds.has(account.id));
  const snapshots = new Map<number, CloudSnapshot>();
  const errors: VpsInventoryResponse["errors"] = [];

  await Promise.all(
    accountRows.map(async (account) => {
      try {
        const accessToken = await fetchGoogleAccessToken(env, account, { fetch: fetcher });
        const instances = await listProjectInstances({
          fetcher,
          accessToken,
          accountId: account.id,
          accountName: account.name,
          projectId: account.project_id
        });
        snapshots.set(account.id, {
          accountName: account.name,
          instances: new Map(
            instances.map((instance) => [
              cloudKey(instance.projectId, instance.zone, instance.name),
              instance
            ])
          ),
          error: null
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load GCP instances.";
        snapshots.set(account.id, { accountName: account.name, instances: new Map(), error: message });
        errors.push({ scope: "account", accountId: account.id, message });
      }
    })
  );

  for (const accountId of referencedIds) {
    if (!snapshots.has(accountId)) {
      const message = "Linked GCP account was not found.";
      snapshots.set(accountId, {
        accountName: `Account ${accountId}`,
        instances: new Map(),
        error: message
      });
      errors.push({ scope: "account", accountId, message });
    }
  }

  return { snapshots, errors };
}

export async function listVpsResources(
  env: Env,
  options: VpsServiceOptions = {}
): Promise<VpsInventoryResponse> {
  const hosts = await new VpsHostRepository(env.DB).listAll();
  const { snapshots, errors } = await loadCloudSnapshots(env, hosts, options);
  return {
    vps: hosts.map((host) =>
      toResource(host, host.gcp_account_id === null ? undefined : snapshots.get(host.gcp_account_id))
    ),
    errors
  };
}

export async function getVpsResource(
  env: Env,
  hostId: number,
  options: VpsServiceOptions = {}
): Promise<VpsResource> {
  const response = await listVpsResources(env, options);
  const resource = response.vps.find((item) => item.id === hostId);
  if (!resource) throw new ControlApiError("not_found", "VPS was not found.", 404);
  return resource;
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
  const current = await repository.findById(hostId);
  if (!current) throw new ControlApiError("not_found", "VPS was not found.", 404);
  if (cloudIdentity(current) && input.address !== undefined && input.address !== current.address) {
    throw new ControlApiError(
      "cloud_address_managed",
      "The address of a GCP-backed VPS is managed by its cloud instance.",
      409
    );
  }
  const passwordCiphertext =
    input.password === undefined
      ? undefined
      : await new PasswordCrypto(env.VPS_PASSWORD_KEY).encrypt(input.password);
  const updated = await repository.patch(hostId, input, passwordCiphertext);
  if (!updated) throw new ControlApiError("not_found", "VPS was not found.", 404);
  return getVpsResource(env, hostId);
}

async function compensateCreatedInstance(
  env: Env,
  identity: GcpHostIdentity,
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

  const identity: GcpHostIdentity = {
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
    if (!address) {
      throw new Error("The new GCP VPS does not have an external IP address.");
    }

    const passwordCiphertext = await new PasswordCrypto(env.VPS_PASSWORD_KEY).encrypt(
      DEFAULT_VPS_SSH_PASSWORD
    );
    const host = await new VpsHostRepository(env.DB).create(
      {
        name: identity.instanceName,
        address,
        port: 22,
        username: DEFAULT_VPS_SSH_USERNAME,
        password: DEFAULT_VPS_SSH_PASSWORD,
        verify_command: null
      },
      passwordCiphertext,
      identity
    );
    if (!host) throw new Error("Unable to save the new VPS host.");
    return { vps: toResource(host, { accountName: account.name, instances: new Map([[cloudKey(identity.projectId, identity.zone, identity.instanceName), instance]]), error: null }), operation };
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

async function runCloudAction(
  env: Env,
  host: VpsHostRecord,
  action: GcpInstanceLifecycleAction,
  options: VpsServiceOptions
): Promise<VpsActionResult> {
  const identity = cloudIdentity(host);
  if (!identity) {
    throw new ControlApiError(
      "cloud_action_unavailable",
      "This manually managed VPS does not support cloud lifecycle actions.",
      409
    );
  }
  const account = await loadAccountRow(env, identity.accountId);
  const fetcher = options.fetcher ?? fetch;
  const batchId = crypto.randomUUID();
  let operationName: string | undefined;

  try {
    const accessToken = await fetchGoogleAccessToken(env, account, { fetch: fetcher });
    operationName = await submitInstanceAction({
      fetcher,
      accessToken,
      projectId: identity.projectId,
      zone: identity.zone,
      instanceName: identity.instanceName,
      action
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

    if (action === "start") {
      const instance = await getProjectInstance({
        fetcher,
        accessToken,
        accountId: account.id,
        accountName: account.name,
        projectId: identity.projectId,
        zone: identity.zone,
        instanceName: identity.instanceName
      });
      const address = instance.externalIps[0];
      if (address && address !== host.address) {
        await new VpsHostRepository(env.DB).updateAddress(host.id, address);
      }
    }

    const result: GcpOperationResult = {
      accountId: account.id,
      projectId: identity.projectId,
      zone: identity.zone,
      instanceName: identity.instanceName,
      action,
      status: "succeeded",
      googleOperationName: operationName
    };
    await recordOperation(env, result, {
      batchId,
      accountId: account.id,
      accountName: account.name,
      hostId: host.id
    });
    return { ...result, action, hostId: host.id, hostName: host.name };
  } catch (error) {
    const result: GcpOperationResult = {
      accountId: account.id,
      projectId: identity.projectId,
      zone: identity.zone,
      instanceName: identity.instanceName,
      action,
      status: "failed",
      googleOperationName: operationName,
      message: error instanceof Error ? error.message : "Cloud action failed."
    };
    await recordOperation(env, result, {
      batchId,
      accountId: account.id,
      accountName: account.name,
      hostId: host.id
    });
    throw new ControlApiError("cloud_action_failed", result.message ?? "Cloud action failed.", 502, {
      result: { ...result, hostId: host.id, hostName: host.name }
    });
  }
}

export async function runVpsAction(
  env: Env,
  hostId: number,
  action: Exclude<GcpInstanceLifecycleAction, "delete">,
  options: VpsServiceOptions = {}
): Promise<VpsActionResult> {
  const host = await new VpsHostRepository(env.DB).findById(hostId);
  if (!host) throw new ControlApiError("not_found", "VPS was not found.", 404);
  return runCloudAction(env, host, action, options);
}

export async function deleteVps(
  env: Env,
  hostId: number,
  options: VpsServiceOptions = {}
): Promise<{ id: number; name: string; deleted: true }> {
  const repository = new VpsHostRepository(env.DB);
  const host = await repository.findById(hostId);
  if (!host) return { id: hostId, name: `VPS ${hostId}`, deleted: true };
  const identity = cloudIdentity(host);

  if (identity) {
    try {
      await runCloudAction(env, host, "delete", options);
    } catch (error) {
      if (!(error instanceof ControlApiError) || !(error.details && isCloudNotFound(error.details))) {
        throw error;
      }
    }
  }

  await repository.delete(host.id);
  return { id: host.id, name: host.name, deleted: true };
}

function isCloudNotFound(details: unknown): boolean {
  if (typeof details !== "object" || details === null || !("result" in details)) return false;
  const result = (details as { result?: { message?: string } }).result;
  return typeof result?.message === "string" && /not found|404/i.test(result.message);
}

export async function runBatchVpsAction(
  env: Env,
  hostIds: number[],
  action: GcpInstanceLifecycleAction,
  options: VpsServiceOptions = {}
): Promise<{
  results: Array<{
    hostId: number;
    hostName: string;
    action: GcpInstanceLifecycleAction;
    status: "submitted" | "succeeded" | "failed" | "skipped";
    message?: string;
    accountId?: number;
    projectId?: string;
    zone?: string;
    instanceName?: string;
    googleOperationName?: string;
  }>;
}> {
  const uniqueIds = [...new Set(hostIds)];
  if (uniqueIds.length === 0 || uniqueIds.length > 50) {
    throw new ControlApiError("invalid_targets", "Choose between 1 and 50 VPS records.", 400);
  }
  const results: Array<{
    hostId: number;
    hostName: string;
    action: GcpInstanceLifecycleAction;
    status: "submitted" | "succeeded" | "failed" | "skipped";
    message?: string;
    accountId?: number;
    projectId?: string;
    zone?: string;
    instanceName?: string;
    googleOperationName?: string;
  }> = [];

  for (let index = 0; index < uniqueIds.length; index += 3) {
    const chunk = uniqueIds.slice(index, index + 3);
    const settled = await Promise.allSettled(
      chunk.map(async (hostId) => {
        if (action === "delete") {
          const deleted = await deleteVps(env, hostId, options);
          return { hostId, hostName: deleted.name, action, status: "succeeded" as const };
        }
        return runVpsAction(env, hostId, action, options);
      })
    );
    settled.forEach((item, itemIndex) => {
      if (item.status === "fulfilled") {
        results.push(item.value);
      } else {
        const hostId = chunk[itemIndex];
        results.push({
          hostId,
          hostName: `VPS ${hostId}`,
          action,
          status: "failed",
          message: item.reason instanceof Error ? item.reason.message : "VPS action failed."
        });
      }
    });
  }

  return { results };
}

export async function reconcileVpsCloudLinks(
  env: Env,
  options: VpsServiceOptions = {}
): Promise<{
  linked: Array<{ hostId: number; accountId: number; projectId: string; zone: string; instanceName: string }>;
  conflicts: Array<{ hostId: number; address: string; matches: number }>;
  errors: Array<{ accountId: number; message: string }>;
}> {
  const fetcher = options.fetcher ?? fetch;
  const repository = new VpsHostRepository(env.DB);
  const hosts = await repository.listUnlinked();
  const candidatesByIp = new Map<string, Array<GcpHostIdentity>>();
  const errors: Array<{ accountId: number; message: string }> = [];

  await Promise.all(
    (await listAccountRows(env)).map(async (account) => {
      try {
        const accessToken = await fetchGoogleAccessToken(env, account, { fetch: fetcher });
        const instances = await listProjectInstances({
          fetcher,
          accessToken,
          accountId: account.id,
          accountName: account.name,
          projectId: account.project_id
        });
        for (const instance of instances) {
          for (const address of instance.externalIps) {
            const identity = {
              accountId: account.id,
              projectId: instance.projectId,
              zone: instance.zone,
              instanceName: instance.name
            };
            candidatesByIp.set(address, [...(candidatesByIp.get(address) ?? []), identity]);
          }
        }
      } catch (error) {
        errors.push({
          accountId: account.id,
          message: error instanceof Error ? error.message : "Unable to inspect GCP account."
        });
      }
    })
  );

  const linked: Array<{ hostId: number; accountId: number; projectId: string; zone: string; instanceName: string }> = [];
  const conflicts: Array<{ hostId: number; address: string; matches: number }> = [];
  for (const host of hosts) {
    const matches = candidatesByIp.get(host.address) ?? [];
    if (matches.length !== 1) {
      if (matches.length > 1) conflicts.push({ hostId: host.id, address: host.address, matches: matches.length });
      continue;
    }
    try {
      await repository.linkToCloud(host.id, matches[0]);
      linked.push({ hostId: host.id, ...matches[0] });
    } catch {
      conflicts.push({ hostId: host.id, address: host.address, matches: matches.length });
    }
  }

  return { linked, conflicts, errors };
}

export async function cascadeDeleteAccountVps(
  env: Env,
  accountId: number,
  options: VpsServiceOptions = {}
): Promise<{
  deleted: Array<{ id: number; name: string }>;
  failed: Array<{ id: number; name: string; message: string }>;
}> {
  const repository = new VpsHostRepository(env.DB);
  const hosts = await repository.listByGcpAccountId(accountId);
  const deleted: Array<{ id: number; name: string }> = [];
  const failed: Array<{ id: number; name: string; message: string }> = [];

  for (let index = 0; index < hosts.length; index += 3) {
    const chunk = hosts.slice(index, index + 3);
    const settled = await Promise.allSettled(chunk.map((host) => deleteVps(env, host.id, options)));
    settled.forEach((item, itemIndex) => {
      const host = chunk[itemIndex];
      if (item.status === "fulfilled") deleted.push({ id: host.id, name: host.name });
      else failed.push({ id: host.id, name: host.name, message: item.reason instanceof Error ? item.reason.message : "Delete failed." });
    });
  }

  return { deleted, failed };
}

export function isProjectIdentityChange(
  current: { project_id: string; project_number: string },
  input: { projectId?: string; projectNumber?: string }
): boolean {
  return (
    (input.projectId !== undefined && input.projectId.trim() !== current.project_id) ||
    (input.projectNumber !== undefined && input.projectNumber.trim() !== current.project_number)
  );
}

export function errorStatus(error: unknown): number {
  if (error instanceof ControlApiError || error instanceof GcpError) return error.status;
  return 500;
}
