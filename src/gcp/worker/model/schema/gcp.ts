import type { GcpAccount, GcpOperationAction, GcpOperationStatus } from "../../../shared/api";

export interface GcpAccountRow {
  id: number;
  name: string;
  project_id: string;
  service_account_email: string;
  workload_identity_provider: string;
  default_zone: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface GcpVmOperationRow {
  id: number;
  batch_id: string;
  account_id: number | null;
  account_name_snapshot: string | null;
  project_id: string;
  zone: string;
  instance_name: string;
  action: GcpOperationAction;
  status: GcpOperationStatus;
  message: string | null;
  google_operation_name: string | null;
  created_at: string;
}

export function toGcpAccount(row: GcpAccountRow): GcpAccount {
  return {
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    serviceAccountEmail: row.service_account_email,
    workloadIdentityProvider: row.workload_identity_provider,
    defaultZone: row.default_zone,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
