import { and, asc, count, eq, inArray, isNotNull, lte } from "drizzle-orm";

import { createDatabase } from "../../db/client";
import { watcherDeployments } from "../../db/schema";
import {
  NON_TERMINAL_HOST_RUN_STATUSES,
  isTerminalHostRunStatus,
  type AiReviewStatus,
  type HostRunStatus
} from "../../constants/watcher/status";
import type { HostRunRow, ServiceVpsHost } from "../../types/watcher";

export async function getHostRunForReleaseHost(
  db: D1Database,
  releaseId: number,
  hostId: number
): Promise<HostRunRow | null> {
  return (
    (await createDatabase(db)
      .select()
      .from(watcherDeployments)
      .where(
        and(
          eq(watcherDeployments.release_id, releaseId),
          eq(watcherDeployments.host_id, hostId)
        )
      )
      .get()) ?? null
  );
}

export async function getOrCreateHostRun(
  db: D1Database,
  releaseId: number,
  host: ServiceVpsHost,
  now: string
): Promise<HostRunRow> {
  await createDatabase(db)
    .insert(watcherDeployments)
    .values({
      release_id: releaseId,
      host_id: host.id,
      host_name_snapshot: host.name,
      host_address_snapshot: host.address,
      status: "pending",
      created_at: now,
      updated_at: now
    })
    .onConflictDoNothing({
      target: [watcherDeployments.release_id, watcherDeployments.host_id]
    })
    .run();

  const row = await getHostRunForReleaseHost(db, releaseId, host.id);
  if (!row) throw new Error("deployment_get_or_create_failed");
  return row;
}

export async function hasNonTerminalHostRuns(db: D1Database): Promise<boolean> {
  const row = await createDatabase(db)
    .select({ id: watcherDeployments.id })
    .from(watcherDeployments)
    .where(inArray(watcherDeployments.status, [...NON_TERMINAL_HOST_RUN_STATUSES]))
    .limit(1)
    .get();
  return Boolean(row);
}

export async function countNonTerminalHostRuns(db: D1Database): Promise<number> {
  const row = await createDatabase(db)
    .select({ value: count() })
    .from(watcherDeployments)
    .where(inArray(watcherDeployments.status, [...NON_TERMINAL_HOST_RUN_STATUSES]))
    .get();
  return row?.value ?? 0;
}

export async function countRunsByReleaseIds(
  db: D1Database,
  releaseIds: number[]
): Promise<Record<number, Record<string, number>>> {
  if (releaseIds.length === 0) return {};
  const rows = await createDatabase(db)
    .select({
      release_id: watcherDeployments.release_id,
      status: watcherDeployments.status,
      count: count()
    })
    .from(watcherDeployments)
    .where(inArray(watcherDeployments.release_id, releaseIds))
    .groupBy(watcherDeployments.release_id, watcherDeployments.status)
    .all();

  return rows.reduce<Record<number, Record<string, number>>>((acc, row) => {
    const releaseCounts = acc[row.release_id] ?? (acc[row.release_id] = {});
    releaseCounts[row.status] = row.count;
    return acc;
  }, {});
}

export async function listDueRunningHostRuns(
  db: D1Database,
  now: string
): Promise<HostRunRow[]> {
  return createDatabase(db)
    .select()
    .from(watcherDeployments)
    .where(
      and(
        eq(watcherDeployments.status, "running"),
        isNotNull(watcherDeployments.next_check_at),
        lte(watcherDeployments.next_check_at, now)
      )
    )
    .orderBy(asc(watcherDeployments.next_check_at))
    .all();
}

export async function listPendingStartHostRuns(db: D1Database): Promise<HostRunRow[]> {
  return createDatabase(db)
    .select()
    .from(watcherDeployments)
    .where(eq(watcherDeployments.status, "pending"))
    .orderBy(asc(watcherDeployments.created_at), asc(watcherDeployments.id))
    .all();
}

export async function markHostRunStarted(
  db: D1Database,
  id: number,
  startedAt: string,
  nextCheckAt: string,
  deadlineAt: string
): Promise<void> {
  await createDatabase(db)
    .update(watcherDeployments)
    .set({
      status: "running",
      failure_stage: null,
      started_at: startedAt,
      next_check_at: nextCheckAt,
      deadline_at: deadlineAt,
      error_message: null,
      updated_at: startedAt
    })
    .where(eq(watcherDeployments.id, id))
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
  await createDatabase(db)
    .update(watcherDeployments)
    .set({
      status,
      failure_stage: failureStage,
      error_message: errorMessage,
      next_check_at: nextCheckAt,
      finished_at: finishedAt,
      updated_at: now
    })
    .where(eq(watcherDeployments.id, id))
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
  await createDatabase(db)
    .update(watcherDeployments)
    .set({
      status: input.status,
      failure_stage: input.failureStage ?? null,
      last_checked_at: input.now,
      last_log_tail: input.logTail,
      next_check_at: input.nextCheckAt,
      error_message: input.errorMessage,
      finished_at: finishedAt,
      updated_at: input.now
    })
    .where(eq(watcherDeployments.id, id))
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
  await createDatabase(db)
    .update(watcherDeployments)
    .set({
      status: input.status,
      failure_stage: input.status === "failed" ? "ai" : null,
      last_checked_at: input.now,
      last_log_tail: input.logTail,
      last_ai_status: input.aiStatus,
      last_ai_reason: input.aiReason,
      next_check_at: input.nextCheckAt,
      error_message: input.errorMessage,
      finished_at: finishedAt,
      updated_at: input.now
    })
    .where(eq(watcherDeployments.id, id))
    .run();
}

export async function listRunsForRelease(
  db: D1Database,
  releaseId: number
): Promise<HostRunRow[]> {
  return createDatabase(db)
    .select()
    .from(watcherDeployments)
    .where(eq(watcherDeployments.release_id, releaseId))
    .orderBy(asc(watcherDeployments.host_id), asc(watcherDeployments.id))
    .all();
}

export async function getHostRun(db: D1Database, id: number): Promise<HostRunRow | null> {
  return (
    (await createDatabase(db)
      .select()
      .from(watcherDeployments)
      .where(eq(watcherDeployments.id, id))
      .get()) ?? null
  );
}
