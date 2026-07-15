import type {
  GcpInstanceLifecycleAction,
  GcpInstanceStatus,
  GcpOperationStatus
} from "../gcp/shared/api";

export interface CloudVpsDetails {
  provider: "gcp";
  accountId: number;
  accountName: string;
  projectId: string;
  zone: string;
  instanceName: string;
  status: GcpInstanceStatus | null;
  machineType: string | null;
  internalIps: string[];
  externalIps: string[];
  error: string | null;
}

export interface VpsResource {
  id: number;
  name: string;
  address: string;
  port: number;
  username: string;
  verifyCommand: string | null;
  watcherEnabled: boolean;
  source: "gcp" | "manual";
  cloud: CloudVpsDetails | null;
  createdAt: string;
  updatedAt: string;
}

export interface VpsInventoryResponse {
  vps: VpsResource[];
  errors: Array<{ scope: "account" | "project" | "instance"; message: string; accountId?: number; hostId?: number }>;
}

export interface VpsActionResult {
  hostId: number;
  hostName: string;
  accountId: number;
  projectId: string;
  zone: string;
  instanceName: string;
  action: GcpInstanceLifecycleAction;
  status: GcpOperationStatus;
  message?: string;
  googleOperationName?: string;
}

export interface DashboardResponse {
  generatedAt: string;
  summary: {
    accounts: { total: number; enabled: number };
    vps: {
      total: number;
      gcp: number;
      manual: number;
      running: number;
      stopped: number;
      unavailable: number;
      watcherEnabled: number;
    };
    watcher: {
      lastProcessedApkFilename: string | null;
      lastSuccessfulCheckAt: string | null;
      lastCheckError: string | null;
      hasNonTerminalHostRuns: boolean;
      nonTerminalHostRunCount: number;
    };
  };
  recentReleases: Array<{
    id: number;
    apkFilename: string;
    finalUrl: string;
    createdAt: string;
    statusCounts: Record<string, number>;
  }>;
  recentOperations: Array<{
    id: number;
    batchId: string;
    hostId: number | null;
    accountId: number | null;
    accountName: string | null;
    projectId: string;
    zone: string;
    instanceName: string;
    action: string;
    status: string;
    message: string | null;
    googleOperationName: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
  errors: VpsInventoryResponse["errors"];
}
