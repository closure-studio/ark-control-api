import type { VpsHostRow, WatcherDeploymentRow } from "../db/schema";
import type { AiReviewStatus } from "./constants/status";
export type { Env } from "../env";

export type ServiceVpsHost = VpsHostRow;

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

export type HostRunRow = WatcherDeploymentRow;
