import { isTerminalHostRunStatus, type AiReviewStatus, type HostRunStatus } from "../constants/status";

export async function insertAiReview(
  db: D1Database,
  input: {
    hostRunId: number;
    model: string;
    promptVersion: string;
    status: AiReviewStatus;
    responseValid: boolean;
    reason: string;
    rawResponse: string;
    createdAt: string;
  },
): Promise<void> {
  await db
    .prepare("INSERT INTO watcher_ai_reviews (deployment_id, model, prompt_version, status, response_valid, reason, raw_response, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(
      input.hostRunId,
      input.model,
      input.promptVersion,
      input.status,
      input.responseValid ? 1 : 0,
      input.reason,
      input.rawResponse,
      input.createdAt
    )
    .run();
}

export async function recordAiReview(
  db: D1Database,
  input: {
    hostRunId: number;
    deploymentStatus: HostRunStatus;
    logTail: string;
    nextCheckAt: string | null;
    errorMessage: string | null;
    model: string;
    promptVersion: string;
    status: AiReviewStatus;
    responseValid: boolean;
    reason: string;
    rawResponse: string;
    createdAt: string;
  }
): Promise<void> {
  const finishedAt = isTerminalHostRunStatus(input.deploymentStatus) ? input.createdAt : null;
  await db.batch([
    db.prepare(`UPDATE watcher_deployments
      SET status = ?, failure_stage = ?, attempt_count = attempt_count + 1,
          last_checked_at = ?, last_log_tail = ?, last_ai_status = ?, last_ai_reason = ?,
          next_check_at = ?, error_message = ?, finished_at = ?, updated_at = ?
      WHERE id = ?`).bind(
      input.deploymentStatus,
      input.deploymentStatus === "failed" ? "ai" : null,
      input.createdAt,
      input.logTail,
      input.status,
      input.reason,
      input.nextCheckAt,
      input.errorMessage,
      finishedAt,
      input.createdAt,
      input.hostRunId
    ),
    db.prepare(`INSERT INTO watcher_ai_reviews (
      deployment_id, model, prompt_version, status, response_valid, reason, raw_response, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      input.hostRunId,
      input.model,
      input.promptVersion,
      input.status,
      input.responseValid ? 1 : 0,
      input.reason,
      input.rawResponse,
      input.createdAt
    )
  ]);
}
