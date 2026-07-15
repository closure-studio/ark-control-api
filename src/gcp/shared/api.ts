export interface Item {
  id: number;
  name: string;
  createdAt: string;
}

export interface HealthResponse {
  ok: true;
  service: "ark-gcp";
  time: string;
}

export interface ItemsResponse {
  items: Item[];
}

export interface ItemResponse {
  item: Item;
}

export interface ErrorResponse {
  error: string;
}

export interface GcpAccount {
  id: number;
  name: string;
  projectId: string;
  projectNumber: string;
  serviceAccountEmail: string;
  workloadIdentityProvider: string;
  defaultZone: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type KnownGcpInstanceStatus =
  | "PROVISIONING"
  | "STAGING"
  | "RUNNING"
  | "STOPPING"
  | "SUSPENDING"
  | "SUSPENDED"
  | "TERMINATED"
  | "REPAIRING";
export type GcpInstanceStatus = KnownGcpInstanceStatus | (string & {});

export interface GcpInstance {
  accountId: number;
  accountName: string;
  projectId: string;
  zone: string;
  name: string;
  status: GcpInstanceStatus;
  machineType: string;
  internalIps: string[];
  externalIps: string[];
  labels: Record<string, string>;
}

export interface GcpPartialError {
  scope: "account" | "project" | "instance";
  accountId?: number;
  projectId?: string;
  zone?: string;
  instanceName?: string;
  message: string;
}

export interface GcpAccountsResponse {
  accounts: GcpAccount[];
}

export interface GcpAccountResponse {
  account: GcpAccount;
}

export interface GcpInstancesResponse {
  instances: GcpInstance[];
  errors: GcpPartialError[];
}

export type GcpInstanceLifecycleAction = "start" | "stop" | "delete";
export type GcpOperationAction = "create" | "start" | "stop" | "delete";

export interface GcpInstanceLifecycleTarget {
  accountId: number;
  projectId: string;
  zone: string;
  instanceName: string;
  status?: GcpInstanceStatus;
}

export interface GcpInstancesActionRequest {
  action: GcpInstanceLifecycleAction;
  instances: GcpInstanceLifecycleTarget[];
}

export type GcpOperationStatus = "submitted" | "succeeded" | "failed" | "skipped";

export interface GcpOperationResult {
  accountId: number;
  projectId: string;
  zone: string;
  instanceName: string;
  action: GcpOperationAction;
  status: GcpOperationStatus;
  message?: string;
  googleOperationName?: string;
}

export interface GcpInstancesActionResponse {
  results: GcpOperationResult[];
}

export interface GcpCreateVpsResponse {
  result: GcpOperationResult;
}
