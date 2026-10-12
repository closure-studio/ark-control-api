import { VpsHostRepository } from "../../repositories/vps/vps-hosts";
import type { Env } from "../../schemas/env";
import type { GcpInstance } from "../../schemas/gcp/compute";
import { listEnabledAccountRows } from "./accounts";
import { fetchGoogleAccessToken } from "./auth";
import { listProjectInstances, submitInstanceAction } from "./compute";

type KeepaliveOptions = {
  fetcher?: typeof fetch;
};

export async function runGcpInstanceKeepalive(
  env: Env,
  options: KeepaliveOptions = {}
): Promise<void> {
  const repository = new VpsHostRepository(env.DB);
  const hosts = await repository.listAll();
  if (hosts.length === 0) return;

  const fetcher = options.fetcher ?? fetch;
  const instances: GcpInstance[] = [];
  const tokens = new Map<number, string>();
  // Complete discovery before acting: names can collide across projects/zones.
  for (const account of await listEnabledAccountRows(env)) {
    const accessToken = await fetchGoogleAccessToken(env, account, { fetch: fetcher });
    instances.push(
      ...(await listProjectInstances({
        fetcher,
        accessToken,
        accountId: account.id,
        accountName: account.name,
        projectId: account.project_id
      }))
    );
    tokens.set(account.id, accessToken);
  }

  for (const host of hosts) {
    const matches = instances.filter((instance) => instance.name === host.name);
    const [instance] = matches;
    if (matches.length > 1) {
      console.warn("GCP keepalive skipped ambiguous VPS name", {
        hostId: host.id,
        name: host.name
      });
      continue;
    }
    if (!instance) continue;
    const accessToken = tokens.get(instance.accountId);
    if (!accessToken) continue;

    // A VPS removed or renamed during discovery is no longer managed by this match.
    const current = await repository.findById(host.id);
    if (current?.name !== instance.name) continue;

    if (instance.status === "TERMINATED") {
      try {
        const operationName = await submitInstanceAction({
          fetcher,
          accessToken,
          projectId: instance.projectId,
          zone: instance.zone,
          instanceName: instance.name,
          action: "start"
        });
        if (!operationName)
          throw new Error("GCP start response did not include an operation name.");
        console.info("GCP keepalive start submitted", {
          hostId: host.id,
          name: host.name,
          operationName
        });
      } catch (error) {
        // Individual GCP failures wait for the next ten-minute cycle.
        console.error("GCP keepalive instance failed", {
          hostId: host.id,
          name: host.name,
          projectId: instance.projectId,
          zone: instance.zone,
          error: error instanceof Error ? error.message : "Unknown GCP keepalive failure"
        });
      }
      continue;
    }

    const address = instance.externalIps[0];
    if (instance.status === "RUNNING" && address && address !== current.address) {
      const updated = await repository.updateAddressIfNameMatches(host.id, instance.name, address);
      if (updated) {
        console.info("GCP keepalive updated VPS address", {
          hostId: host.id,
          name: host.name,
          address
        });
      }
    }
  }
}
