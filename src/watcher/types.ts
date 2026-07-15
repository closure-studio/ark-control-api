import type { AiReviewStatus, HostRunStatus } from "./constants/status";
export type { Env } from "../env";

export interface ServiceVpsHost {
  id: number;
  name: string;
  address: string;
  port: number;
  username: string;
  password_ciphertext: string;
  verify_command: string | null;
  enabled: number;
  password_updated_at: string;
  created_at: string;
  updated_at: string;
}

export interface ExecuteHostCommandResult {
  connected: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  success: boolean;
  timedOut: boolean;
}

export interface ApkMetadata {
  finalUrl: string;
  apkFilename: string;
}

export interface AiReviewResult {
  status: AiReviewStatus;
  reason: string;
  rawResponse: string;
}

export interface HostRunRow {
  id: number;
  release_id: number;
  host_id: number | null;
  host_name_snapshot: string;
  host_address_snapshot: string;
  host_port_snapshot: number;
  host_username_snapshot: string;
  status: HostRunStatus;
  failure_stage: "start" | "ssh" | "ai" | "deadline" | null;
  attempt_count: number;
  started_at: string | null;
  next_check_at: string | null;
  deadline_at: string | null;
  last_checked_at: string | null;
  finished_at: string | null;
  last_log_tail: string | null;
  last_ai_status: AiReviewStatus | null;
  last_ai_reason: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
