export const HOST_RUN_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "timed_out",
] as const;

export type HostRunStatus = (typeof HOST_RUN_STATUSES)[number];

export const NON_TERMINAL_HOST_RUN_STATUSES = ["pending", "running"] as const satisfies readonly HostRunStatus[];
export const TERMINAL_HOST_RUN_STATUSES = ["succeeded", "failed", "timed_out"] as const satisfies readonly HostRunStatus[];
export type TerminalHostRunStatus = (typeof TERMINAL_HOST_RUN_STATUSES)[number];

export const AI_REVIEW_STATUSES = ["success", "running", "failed", "unknown"] as const;
export type AiReviewStatus = (typeof AI_REVIEW_STATUSES)[number];

export function isTerminalHostRunStatus(status: HostRunStatus): status is TerminalHostRunStatus {
  return (TERMINAL_HOST_RUN_STATUSES as readonly HostRunStatus[]).includes(status);
}

export function isAiReviewStatus(value: string): value is AiReviewStatus {
  return (AI_REVIEW_STATUSES as readonly string[]).includes(value);
}
