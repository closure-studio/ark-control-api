import type { ApiErrorCode } from "../constants/errors";

export interface AdminVpsHost {
  id: number;
  name: string;
  address: string;
  port: number;
  username: string;
  verify_command: string | null;
  enabled: boolean;
  gcp_account_id: number | null;
  gcp_project_id: string | null;
  gcp_zone: string | null;
  gcp_instance_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface GcpHostIdentity {
  accountId: number;
  projectId: string;
  zone: string;
  instanceName: string;
}

export interface ServiceVpsHost extends AdminVpsHost {
  password_ciphertext: string;
}

export interface CreateVpsHostRequest {
  name: string;
  address: string;
  port?: number;
  username: string;
  password: string;
  verify_command?: string | null;
}

export interface PatchVpsHostRequest {
  name?: string;
  address?: string;
  port?: number;
  username?: string;
  password?: string;
  verify_command?: string | null;
  enabled?: boolean;
}

export interface AdminVpsHostsResponse {
  hosts: AdminVpsHost[];
}

export interface AdminVpsHostResponse {
  host: AdminVpsHost;
}

export interface ServiceVpsHostsResponse {
  hosts: ServiceVpsHost[];
}

export interface ApiErrorResponse {
  error: ApiErrorCode;
  message?: string;
}
