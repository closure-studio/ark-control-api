export const HOST_RUN_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "timed_out"
] as const;

export const NON_TERMINAL_HOST_RUN_STATUSES = ["pending", "running"] as const;
export const TERMINAL_HOST_RUN_STATUSES = ["succeeded", "failed", "timed_out"] as const;

export const AI_REVIEW_STATUSES = ["success", "running", "failed", "unknown"] as const;
