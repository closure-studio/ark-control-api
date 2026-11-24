import {
  AggregatedInstancesResponseSchema,
  ComputeInstanceSchema,
  ComputeOperationResponseSchema,
  type ComputeInstance,
  type ComputeOperationResponse,
  type GcpInstance,
  type ProvisionGcpVpsRequest
} from "../../schemas/gcp/compute";
import type { GcpInstanceLifecycleAction } from "../../schemas/gcp/operations";
import { DEFAULT_VPS_STARTUP_SCRIPT } from "./startup-script";
import { requestGoogleJson } from "./google-http";

const MIB_PER_GB = 1024;
export const DEFAULT_VPS_BOOT_IMAGE =
  "projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts-arm64";
const DEFAULT_VPS_BOOT_DISK_TYPE = "hyperdisk-balanced";
const DEFAULT_VPS_NETWORK_TAGS = ["http-server", "https-server"] as const;

const SCHEDULING_BY_MODEL = {
  SPOT: {
    automaticRestart: false,
    onHostMaintenance: "TERMINATE",
    provisioningModel: "SPOT",
    instanceTerminationAction: "STOP",
    preemptionNoticeDuration: { seconds: "0" }
  },
  STANDARD: {
    automaticRestart: true,
    onHostMaintenance: "MIGRATE",
    provisioningModel: "STANDARD"
  }
} as const;

export type CreateDefaultInstanceInput = {
  fetcher: typeof fetch;
  accessToken: string;
  projectId: string;
  zone: string;
  instanceName: string;
  startupScript?: string;
  spec: ProvisionGcpVpsRequest;
};

function tail(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const parts = value.split("/");
  return parts[parts.length - 1] ?? value;
}

function regionFromZone(zone: string): string {
  return zone.split("-").slice(0, -1).join("-");
}

export function buildDefaultInstanceInsertRequest(input: {
  zone: string;
  instanceName: string;
  startupScript?: string;
  spec: ProvisionGcpVpsRequest;
}) {
  const region = regionFromZone(input.zone);
  const machineType = `n4a-custom-${input.spec.cpuCount}-${input.spec.memoryGb * MIB_PER_GB}`;
  return {
    name: input.instanceName,
    machineType: `zones/${input.zone}/machineTypes/${machineType}`,
    disks: [
      {
        boot: true,
        autoDelete: true,
        mode: "READ_WRITE",
        type: "PERSISTENT",
        deviceName: input.instanceName,
        initializeParams: {
          diskSizeGb: String(input.spec.diskSizeGb),
          sourceImage: DEFAULT_VPS_BOOT_IMAGE,
          diskType: `zones/${input.zone}/diskTypes/${DEFAULT_VPS_BOOT_DISK_TYPE}`
        }
      }
    ],
    networkInterfaces: [
      {
        subnetwork: `regions/${region}/subnetworks/default`,
        stackType: "IPV4_ONLY",
        accessConfigs: [{ name: "External NAT", type: "ONE_TO_ONE_NAT", networkTier: "PREMIUM" }]
      }
    ],
    scheduling: SCHEDULING_BY_MODEL[input.spec.provisioningModel],
    tags: { items: [...DEFAULT_VPS_NETWORK_TAGS] },
    metadata: {
      items: [{ key: "startup-script", value: input.startupScript ?? DEFAULT_VPS_STARTUP_SCRIPT }]
    },
    shieldedInstanceConfig: {
      enableSecureBoot: false,
      enableVtpm: true,
      enableIntegrityMonitoring: true
    },
    reservationAffinity: { consumeReservationType: "NO_RESERVATION" }
  };
}

function computeOperationErrorMessage(operation: ComputeOperationResponse): string | null {
  const [error] = operation.error?.errors ?? [];
  if (!error) {
    return null;
  }
  if (error.code && error.message) {
    return `${error.code}: ${error.message}`;
  }
  return error.message ?? error.code ?? "Compute operation failed.";
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function normalizeComputeInstance(input: {
  accountId: number;
  accountName: string;
  projectId: string;
  zoneKey: string;
  instance: ComputeInstance;
}): GcpInstance {
  const networkInterfaces = input.instance.networkInterfaces ?? [];
  return {
    accountId: input.accountId,
    accountName: input.accountName,
    projectId: input.projectId,
    zone: tail(input.zoneKey),
    name: input.instance.name ?? "",
    status: input.instance.status ?? "UNKNOWN",
    machineType: tail(input.instance.machineType),
    internalIps: networkInterfaces.flatMap((networkInterface) =>
      networkInterface.networkIP ? [networkInterface.networkIP] : []
    ),
    externalIps: networkInterfaces.flatMap((networkInterface) =>
      (networkInterface.accessConfigs ?? []).flatMap((config) =>
        config.natIP ? [config.natIP] : []
      )
    ),
    labels: input.instance.labels ?? {}
  };
}

export async function listProjectInstances(input: {
  fetcher: typeof fetch;
  accessToken: string;
  accountId: number;
  accountName: string;
  projectId: string;
}): Promise<GcpInstance[]> {
  const instances: GcpInstance[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(
        input.projectId
      )}/aggregated/instances`
    );
    url.searchParams.set("maxResults", "500");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await requestGoogleJson(
      input.fetcher,
      url.toString(),
      input.accessToken,
      AggregatedInstancesResponseSchema
    );

    for (const [zoneKey, scopedList] of Object.entries(response.items ?? {})) {
      for (const instance of scopedList.instances ?? []) {
        instances.push(
          normalizeComputeInstance({
            accountId: input.accountId,
            accountName: input.accountName,
            projectId: input.projectId,
            zoneKey,
            instance
          })
        );
      }
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  return instances;
}

export async function getProjectInstance(input: {
  fetcher: typeof fetch;
  accessToken: string;
  accountId: number;
  accountName: string;
  projectId: string;
  zone: string;
  instanceName: string;
}): Promise<GcpInstance> {
  const url = `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(
    input.projectId
  )}/zones/${encodeURIComponent(input.zone)}/instances/${encodeURIComponent(input.instanceName)}`;
  const instance = await requestGoogleJson(
    input.fetcher,
    url,
    input.accessToken,
    ComputeInstanceSchema
  );
  return normalizeComputeInstance({
    accountId: input.accountId,
    accountName: input.accountName,
    projectId: input.projectId,
    zoneKey: input.zone,
    instance
  });
}

export async function submitInstanceAction(input: {
  fetcher: typeof fetch;
  accessToken: string;
  projectId: string;
  zone: string;
  instanceName: string;
  action: GcpInstanceLifecycleAction;
}): Promise<string | undefined> {
  const instanceUrl = `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(
    input.projectId
  )}/zones/${encodeURIComponent(input.zone)}/instances/${encodeURIComponent(input.instanceName)}`;
  const url = input.action === "delete" ? instanceUrl : `${instanceUrl}/${input.action}`;
  const method = input.action === "delete" ? "DELETE" : "POST";
  const response = await requestGoogleJson(
    input.fetcher,
    url,
    input.accessToken,
    ComputeOperationResponseSchema,
    { method }
  );
  return response.name;
}

export async function createDefaultInstance(
  input: CreateDefaultInstanceInput
): Promise<string | undefined> {
  const url = `https://compute.googleapis.com/compute/beta/projects/${encodeURIComponent(
    input.projectId
  )}/zones/${encodeURIComponent(input.zone)}/instances`;
  const response = await requestGoogleJson(
    input.fetcher,
    url,
    input.accessToken,
    ComputeOperationResponseSchema,
    {
      method: "POST",
      body: JSON.stringify(
        buildDefaultInstanceInsertRequest({
          zone: input.zone,
          instanceName: input.instanceName,
          ...(input.startupScript !== undefined ? { startupScript: input.startupScript } : {}),
          spec: input.spec
        })
      )
    }
  );
  return response.name;
}

export async function waitForZoneOperation(input: {
  fetcher: typeof fetch;
  accessToken: string;
  projectId: string;
  zone: string;
  operationName: string;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<void> {
  const url = `https://compute.googleapis.com/compute/beta/projects/${encodeURIComponent(
    input.projectId
  )}/zones/${encodeURIComponent(input.zone)}/operations/${encodeURIComponent(input.operationName)}`;
  const maxAttempts = input.maxAttempts ?? 6;
  const delayMs = input.delayMs ?? 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const operation = await requestGoogleJson(
      input.fetcher,
      url,
      input.accessToken,
      ComputeOperationResponseSchema
    );
    if (operation.status === "DONE") {
      const message = computeOperationErrorMessage(operation);
      if (message) {
        throw new Error(message);
      }
      return;
    }
    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(`Google Compute operation ${input.operationName} did not finish in time.`);
}
