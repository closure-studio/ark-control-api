import type { GcpInstance, GcpInstanceLifecycleAction } from "../../../shared/api";
import {
  DEFAULT_VPS_BOOT_DISK,
  DEFAULT_VPS_BOOT_IMAGE,
  DEFAULT_VPS_MACHINE_TYPE,
  DEFAULT_VPS_NETWORK_TAGS,
  DEFAULT_VPS_STARTUP_SCRIPT
} from "./constants";
import { requestGoogleJson } from "./google-http";

type ComputeNetworkInterface = {
  networkIP?: string;
  accessConfigs?: Array<{ natIP?: string }>;
};

type ComputeInstance = {
  name?: string;
  status?: string;
  machineType?: string;
  networkInterfaces?: ComputeNetworkInterface[];
  labels?: Record<string, string>;
};

type AggregatedInstancesResponse = {
  items?: Record<string, { instances?: ComputeInstance[] }>;
  nextPageToken?: string;
};

type ComputeOperationResponse = {
  name?: string;
  status?: string;
  error?: {
    errors?: Array<{
      code?: string;
      message?: string;
    }>;
  };
};

export type CreateDefaultInstanceInput = {
  fetcher: typeof fetch;
  accessToken: string;
  projectId: string;
  zone: string;
  instanceName: string;
  startupScript?: string;
};

type ComputeInstanceInsertRequest = {
  name: string;
  machineType: string;
  disks: Array<{
    boot: boolean;
    autoDelete: boolean;
    mode: "READ_WRITE";
    type: "PERSISTENT";
    deviceName: string;
    initializeParams: {
      diskSizeGb: string;
      sourceImage: string;
      diskType: string;
      provisionedIops: string;
      provisionedThroughput: string;
    };
  }>;
  networkInterfaces: Array<{
    subnetwork: string;
    stackType: "IPV4_ONLY";
    accessConfigs: Array<{
      name: "External NAT";
      type: "ONE_TO_ONE_NAT";
      networkTier: "PREMIUM";
    }>;
  }>;
  scheduling: {
    automaticRestart: false;
    onHostMaintenance: "TERMINATE";
    provisioningModel: "SPOT";
    instanceTerminationAction: "STOP";
    preemptionNoticeDuration: { seconds: "0" };
  };
  tags: { items: string[] };
  metadata: {
    items: Array<{ key: "startup-script"; value: string }>;
  };
  shieldedInstanceConfig: {
    enableSecureBoot: false;
    enableVtpm: true;
    enableIntegrityMonitoring: true;
  };
  labels: { "goog-ec-src": "vm_add-gcloud" };
  reservationAffinity: { consumeReservationType: "NO_RESERVATION" };
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
}): ComputeInstanceInsertRequest {
  const region = regionFromZone(input.zone);
  return {
    name: input.instanceName,
    machineType: `zones/${input.zone}/machineTypes/${DEFAULT_VPS_MACHINE_TYPE}`,
    disks: [
      {
        boot: true,
        autoDelete: true,
        mode: "READ_WRITE",
        type: "PERSISTENT",
        deviceName: input.instanceName,
        initializeParams: {
          diskSizeGb: DEFAULT_VPS_BOOT_DISK.sizeGb,
          sourceImage: DEFAULT_VPS_BOOT_IMAGE,
          diskType: `zones/${input.zone}/diskTypes/${DEFAULT_VPS_BOOT_DISK.type}`,
          provisionedIops: DEFAULT_VPS_BOOT_DISK.provisionedIops,
          provisionedThroughput: DEFAULT_VPS_BOOT_DISK.provisionedThroughput
        }
      }
    ],
    networkInterfaces: [
      {
        subnetwork: `regions/${region}/subnetworks/default`,
        stackType: "IPV4_ONLY",
        accessConfigs: [
          { name: "External NAT", type: "ONE_TO_ONE_NAT", networkTier: "PREMIUM" }
        ]
      }
    ],
    scheduling: {
      automaticRestart: false,
      onHostMaintenance: "TERMINATE",
      provisioningModel: "SPOT",
      instanceTerminationAction: "STOP",
      preemptionNoticeDuration: { seconds: "0" }
    },
    tags: { items: [...DEFAULT_VPS_NETWORK_TAGS] },
    metadata: {
      items: [{ key: "startup-script", value: input.startupScript ?? DEFAULT_VPS_STARTUP_SCRIPT }]
    },
    shieldedInstanceConfig: {
      enableSecureBoot: false,
      enableVtpm: true,
      enableIntegrityMonitoring: true
    },
    labels: { "goog-ec-src": "vm_add-gcloud" },
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
      (networkInterface.accessConfigs ?? []).flatMap((config) => (config.natIP ? [config.natIP] : []))
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

    const response = await requestGoogleJson<AggregatedInstancesResponse>(
      input.fetcher,
      url.toString(),
      input.accessToken
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
  const instance = await requestGoogleJson<ComputeInstance>(
    input.fetcher,
    url,
    input.accessToken
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
  )}/zones/${encodeURIComponent(input.zone)}/instances/${encodeURIComponent(
    input.instanceName
  )}`;
  const url = input.action === "delete" ? instanceUrl : `${instanceUrl}/${input.action}`;
  const method = input.action === "delete" ? "DELETE" : "POST";
  const response = await requestGoogleJson<ComputeOperationResponse>(
    input.fetcher,
    url,
    input.accessToken,
    { method }
  );
  return response.name;
}

export async function createDefaultInstance(input: CreateDefaultInstanceInput): Promise<string | undefined> {
  const url = `https://compute.googleapis.com/compute/beta/projects/${encodeURIComponent(
    input.projectId
  )}/zones/${encodeURIComponent(input.zone)}/instances`;
  const response = await requestGoogleJson<ComputeOperationResponse>(
    input.fetcher,
    url,
    input.accessToken,
    {
      method: "POST",
      body: JSON.stringify(
        buildDefaultInstanceInsertRequest({
          zone: input.zone,
          instanceName: input.instanceName,
          startupScript: input.startupScript
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
    const operation = await requestGoogleJson<ComputeOperationResponse>(
      input.fetcher,
      url,
      input.accessToken
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
