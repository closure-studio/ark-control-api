import { MANAGED_GCP_VPS_NAME_PREFIX, VPS_HOST_FIELD_LIMITS } from "../../constants/vps/fields";
import { VpsHostRepository } from "../../repositories/vps/vps-hosts";
import type { Env } from "../../schemas/env";
import type { GcpInstance } from "../../schemas/gcp/compute";
import { PasswordCrypto } from "../vps/password-crypto";
import { listEnabledAccountRows } from "./accounts";
import { fetchGoogleAccessToken } from "./auth";
import { listProjectInstances, submitInstanceAction } from "./compute";
import { DEFAULT_VPS_SSH_PASSWORD, DEFAULT_VPS_SSH_USERNAME } from "./startup-script";

export async function runGcpInstanceKeepalive(
  env: Env,
  options: { fetcher?: typeof fetch } = {}
): Promise<void> {
  const accounts = await listEnabledAccountRows(env);
  if (accounts.length === 0) return;

  const fetcher = options.fetcher ?? fetch;
  const gcpInstances = new Map<string, { instance: GcpInstance; accessToken: string }>();
  // Complete discovery across all enabled accounts before mutating DB or starting VMs.
  for (const account of accounts) {
    const accessToken = await fetchGoogleAccessToken(env, account, { fetch: fetcher });
    const list = await listProjectInstances({
      fetcher,
      accessToken,
      accountId: account.id,
      accountName: account.name,
      projectId: account.project_id
    });
    for (const instance of list) {
      if (instance.name.startsWith(MANAGED_GCP_VPS_NAME_PREFIX)) {
        gcpInstances.set(instance.name, { instance, accessToken });
      }
    }
  }

  const repository = new VpsHostRepository(env.DB);
  const redroidHosts = new Map(
    (await repository.listAll())
      .filter((host) => host.role === "redroid")
      .map((host) => [host.name, host])
  );

  // Delete absent redroid rows first so reused external IPs do not hit unique constraints.
  for (const [name, host] of redroidHosts) {
    if (!gcpInstances.has(name)) {
      await repository.delete(host.id);
    }
  }

  const passwordCrypto = new PasswordCrypto(env.VPS_PASSWORD_KEY);
  for (const { instance, accessToken } of gcpInstances.values()) {
    if (instance.status === "TERMINATED") {
      try {
        await submitInstanceAction({
          fetcher,
          accessToken,
          projectId: instance.projectId,
          zone: instance.zone,
          instanceName: instance.name,
          action: "start"
        });
      } catch (error) {
        console.error("GCP keepalive start failed", {
          name: instance.name,
          projectId: instance.projectId,
          zone: instance.zone,
          error: error instanceof Error ? error.message : "Unknown GCP keepalive failure"
        });
      }
      continue;
    }

    const address = instance.externalIps[0];
    if (instance.status !== "RUNNING" || !address) continue;

    const existing = redroidHosts.get(instance.name);
    if (existing) {
      if (existing.address !== address) {
        await repository.patch(existing.id, { address });
      }
    } else {
      await repository.create(
        {
          name: instance.name,
          address,
          port: VPS_HOST_FIELD_LIMITS.defaultPort,
          username: DEFAULT_VPS_SSH_USERNAME,
          password: DEFAULT_VPS_SSH_PASSWORD,
          role: "redroid"
        },
        await passwordCrypto.encrypt(DEFAULT_VPS_SSH_PASSWORD)
      );
    }
  }
}
