import {
  NON_TERMINAL_HOST_RUN_STATUSES,
  isTerminalHostRunStatus,
  type AiReviewStatus,
  type HostRunStatus
} from "../constants/status";
import type { HostRunRow, ServiceVpsHost } from "../types";

const nonTerminalPlaceholders = NON_TERMINAL_HOST_RUN_STATUSES.map(() => "?").join(", ");

export async function getHostRunForReleaseHost(
  db: D1Database,
  releaseId: number,
  hostId: number
): Promise<HostRunRow | null> {
  return await db
    .prepare("SELECT * FROM watcher_deployments WHERE release_id = ? AND host_id = ?")
    .bind(releaseId, hostId)
    .first<HostRunRow>();
}

export async function getOrCreateHostRun(
  db: D1Database,
  releaseId: number,
  host: ServiceVpsHost,
  now: string
): Promise<HostRunRow> {
  await db
    .prepare(`INSERT OR IGNORE INTO watcher_deployments (
      release_id, host_id, host_name_snapshot, host_address_snapshot,
      host_port_snapshot, host_username_snapshot, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .bind(releaseId, host.id, host.name, host.address, host.port, host.username, now, now)
    .run();

  const row = await getHostRunForReleaseHost(db, releaseId, host.id);
  if (!row) throw new Error("deployment_get_or_create_failed");
  return row;
}

export async function hasNonTerminalHostRuns(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare(`SELECT id FROM watcher_deployments WHERE status IN (${nonTerminalPlaceholders}) LIMIT 1`)
    .bind(...NON_TERMINAL_HOST_RUN_STATUSES)
    .first<{ id: number }>();
  return Boolean(row);
}

export async function countNonTerminalHostRuns(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS count FROM watcher_deployments WHERE status IN (${nonTerminalPlaceholders})`)
    .bind(...NON_TERMINAL_HOST_RUN_STATUSES)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function countRunsByReleaseIds(
  db: D1Database,
  releaseIds: number[]
): Promise<Record<number, Record<string, number>>> {
  if (releaseIds.length === 0) return {};
  const placeholders = releaseIds.map(() => "?").join(", ");
  const result = await db
    .prepare(`SELECT release_id, status, COUNT(*) AS count
      FROM watcher_deployments
      WHERE release_id IN (${placeholders})
      GROUP BY release_id, status`)
    .bind(...releaseIds)
    .all<{ release_id: number; status: string; count: number }>();

  return (result.results ?? []).reduce<Record<number, Record<string, number>>>((acc, row) => {
    acc[row.release_id] ??= {};
    acc[row.release_id][row.status] = row.count;
    return acc;
  }, {});
}

export async function listDueRunningHostRuns(db: D1Database, now: string): Promise<HostRunRow[]> {
  const result = await db
    .prepare("SELECT * FROM watcher_deployments WHERE status = 'running' AND next_check_at IS NOT NULL AND next_check_at <= ? ORDER BY next_check_at ASC")
    .bind(now)
    .all<HostRunRow>();
  return result.results ?? [];
}

export async function listPendingStartHostRuns(db: D1Database): Promise<HostRunRow[]> {
  const result = await db
    .prepare("SELECT * FROM watcher_deployments WHERE status = 'pending' ORDER BY created_at ASC, id ASC")
    .all<HostRunRow>();
  return result.results ?? [];
}

export async function markHostRunStarted(
  db: D1Database,
  id: number,
  startedAt: string,
  nextCheckAt: string,
  deadlineAt: string
): Promise<void> {
  await db
    .prepare(`UPDATE watcher_deployments
      SET status = 'running', failure_stage = NULL, attempt_count = attempt_count + 1,
          started_at = ?, next_check_at = ?, deadline_at = ?, error_message = NULL,
          updated_at = ?
      WHERE id = ?`)
    .bind(startedAt, nextCheckAt, deadlineAt, startedAt, id)
    .run();
}

export async function updateHostRunStatus(
  db: D1Database,
  id: number,
  status: HostRunStatus,
  now: string,
  errorMessage: string | null,
  nextCheckAt: string | null = null,
  failureStage: HostRunRow["failure_stage"] = null
): Promise<void> {
  const finishedAt = isTerminalHostRunStatus(status) ? now : null;
  await db
    .prepare(`UPDATE watcher_deployments
      SET status = ?, failure_stage = ?, error_message = ?, next_check_at = ?,
          finished_at = ?, updated_at = ?
      WHERE id = ?`)
    .bind(status, failureStage, errorMessage, nextCheckAt, finishedAt, now, id)
    .run();
}

export async function updateHostRunExecution(
  db: D1Database,
  id: number,
  input: {
    status: HostRunStatus;
    now: string;
    logTail: string;
    nextCheckAt: string | null;
    errorMessage: string | null;
    failureStage?: HostRunRow["failure_stage"];
  }
): Promise<void> {
  const finishedAt = isTerminalHostRunStatus(input.status) ? input.now : null;
  await db
    .prepare(`UPDATE watcher_deployments
      SET status = ?, failure_stage = ?, attempt_count = attempt_count + 1,
          last_checked_at = ?, last_log_tail = ?, next_check_at = ?, error_message = ?,
          finished_at = ?, updated_at = ?
      WHERE id = ?`)
    .bind(
      input.status,
      input.failureStage ?? null,
      input.now,
      input.logTail,
      input.nextCheckAt,
      input.errorMessage,
      finishedAt,
      input.now,
      id
    )
    .run();
}

export async function updateHostRunReview(
  db: D1Database,
  id: number,
  input: {
    status: HostRunStatus;
    now: string;
    logTail: string;
    aiStatus: AiReviewStatus;
    aiReason: string;
    nextCheckAt: string | null;
    errorMessage: string | null;
  }
): Promise<void> {
  const finishedAt = isTerminalHostRunStatus(input.status) ? input.now : null;
  await db
    .prepare(`UPDATE watcher_deployments
      SET status = ?, failure_stage = ?, attempt_count = attempt_count + 1,
          last_checked_at = ?, last_log_tail = ?, last_ai_status = ?, last_ai_reason = ?,
          next_check_at = ?, error_message = ?, finished_at = ?, updated_at = ?
      WHERE id = ?`)
    .bind(
      input.status,
      input.status === "failed" ? "ai" : null,
      input.now,
      input.logTail,
      input.aiStatus,
      input.aiReason,
      input.nextCheckAt,
      input.errorMessage,
      finishedAt,
      input.now,
      id
    )
    .run();
}

export async function listRunsForRelease(db: D1Database, releaseId: number): Promise<HostRunRow[]> {
  const result = await db
    .prepare("SELECT * FROM watcher_deployments WHERE release_id = ? ORDER BY host_id ASC, id ASC")
    .bind(releaseId)
    .all<HostRunRow>();
  return result.results ?? [];
}

export async function getHostRun(db: D1Database, id: number): Promise<HostRunRow | null> {
  return await db.prepare("SELECT * FROM watcher_deployments WHERE id = ?").bind(id).first<HostRunRow>();
}
