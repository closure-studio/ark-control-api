import type { GcpAccountRow, GcpVmOperationRow } from "../../../../db/schema";
import type { GcpAccount } from "../../../shared/api";

export type { GcpAccountRow, GcpVmOperationRow } from "../../../../db/schema";

export function toGcpAccount(row: GcpAccountRow): GcpAccount {
  return {
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    serviceAccountEmail: row.service_account_email,
    workloadIdentityProvider: row.workload_identity_provider,
    defaultZone: row.default_zone,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
