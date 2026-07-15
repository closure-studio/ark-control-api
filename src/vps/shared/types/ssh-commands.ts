export interface ExecuteHostCommandRequest {
  hostId: number;
  command?: string;
  timeoutMs?: number;
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

export interface ExecuteHostCommandResponse {
  result: ExecuteHostCommandResult;
}
