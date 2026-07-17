import type { InferInput } from "valibot";
import type { ExecuteHostCommandRequestSchema } from "../../schemas/vps/ssh-command";

export type ExecuteHostCommandRequest = InferInput<typeof ExecuteHostCommandRequestSchema>;

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
