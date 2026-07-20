import { and, asc, count, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";

import { createDatabase } from "../../db/client";
import { arknightsApkHostRuns } from "../../db/schema";
import { NON_TERMINAL_HOST_RUN_STATUSES } from "../../constants/apk-delivery/status";
import type { ArknightsApkHostRunRow } from "../../db/schema";
import type { ServiceVpsHost } from "../../schemas/vps/hosts";
import type { AiReviewStatus } from "../../schemas/apk-delivery/ai";
import type { HostRunStatus } from "../../schemas/apk-delivery/status";

export async function getHostRunForReleaseHost(
  db: D1Database,
  releaseId: number,
  hostId: number
): Promise<ArknightsApkHostRunRow | null> {
  return (
    (await createDatabase(db)
      .select()
      .from(arknightsApkHostRuns)
      .where(
        and(
          eq(arknightsApkHostRuns.release_id, releaseId),
          eq(arknightsApkHostRuns.host_id, hostId)
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
): Promise<ArknightsApkHostRunRow> {
  await createDatabase(db)
    .insert(arknightsApkHostRuns)
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
      target: [arknightsApkHostRuns.release_id, arknightsApkHostRuns.host_id]
    })
    .run();

  const row = await getHostRunForReleaseHost(db, releaseId, host.id);
  if (!row) throw new Error("host_run_get_or_create_failed");
  return row;
}

export async function hasNonTerminalHostRuns(db: D1Database): Promise<boolean> {
  const row = await createDatabase(db)
    .select({ id: arknightsApkHostRuns.id })
    .from(arknightsApkHostRuns)
    .where(inArray(arknightsApkHostRuns.status, [...NON_TERMINAL_HOST_RUN_STATUSES]))
    .limit(1)
    .get();
  return Boolean(row);
}

export async function countRunsByReleaseIds(
  db: D1Database,
  releaseIds: number[]
): Promise<Record<number, Record<string, number>>> {
  if (releaseIds.length === 0) return {};
  const rows = await createDatabase(db)
    .select({
      release_id: arknightsApkHostRuns.release_id,
      status: arknightsApkHostRuns.status,
      count: count()
    })
    .from(arknightsApkHostRuns)
    .where(inArray(arknightsApkHostRuns.release_id, releaseIds))
    .groupBy(arknightsApkHostRuns.release_id, arknightsApkHostRuns.status)
    .all();

  return rows.reduce<Record<number, Record<string, number>>>((acc, row) => {
    const releaseCounts = acc[row.release_id] ?? (acc[row.release_id] = {});
    releaseCounts[row.status] = row.count;
    return acc;
  }, {});
}

export async function listHostRuns(
  db: D1Database,
  statuses: readonly HostRunStatus[] | undefined,
  limit: number,
  offset: number
): Promise<ArknightsApkHostRunRow[]> {
  return createDatabase(db)
    .select()
    .from(arknightsApkHostRuns)
    .where(
      statuses === undefined
        ? undefined
        : inArray(arknightsApkHostRuns.status, [...statuses])
    )
    .orderBy(desc(arknightsApkHostRuns.created_at), desc(arknightsApkHostRuns.id))
    .limit(limit)
    .offset(offset)
    .all();
}

export async function countHostRuns(
  db: D1Database,
  statuses: readonly HostRunStatus[] | undefined
): Promise<number> {
  const row = await createDatabase(db)
    .select({ value: count() })
    .from(arknightsApkHostRuns)
    .where(
      statuses === undefined
        ? undefined
        : inArray(arknightsApkHostRuns.status, [...statuses])
    )
    .get();
  return row?.value ?? 0;
}

export async function listDueRunningHostRuns(
  db: D1Database,
  now: string
): Promise<ArknightsApkHostRunRow[]> {
  return createDatabase(db)
    .select()
    .from(arknightsApkHostRuns)
    .where(
      and(
        eq(arknightsApkHostRuns.status, "running"),
        isNotNull(arknightsApkHostRuns.next_check_at),
        lte(arknightsApkHostRuns.next_check_at, now)
      )
    )
    .orderBy(asc(arknightsApkHostRuns.next_check_at))
    .all();
}

export async function listPendingStartHostRuns(db: D1Database): Promise<ArknightsApkHostRunRow[]> {
  return createDatabase(db)
    .select()
    .from(arknightsApkHostRuns)
    .where(eq(arknightsApkHostRuns.status, "pending"))
    .orderBy(asc(arknightsApkHostRuns.created_at), asc(arknightsApkHostRuns.id))
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
    .update(arknightsApkHostRuns)
    .set({
      status: "running",
      started_at: startedAt,
      next_check_at: nextCheckAt,
      deadline_at: deadlineAt,
      error_message: null,
      updated_at: startedAt
    })
    .where(eq(arknightsApkHostRuns.id, id))
    .run();
}

export async function updateHostRunStatus(
  db: D1Database,
  id: number,
  status: HostRunStatus,
  now: string,
  errorMessage: string | null,
  nextCheckAt: string | null = null
): Promise<void> {
  await createDatabase(db)
    .update(arknightsApkHostRuns)
    .set({
      status,
      error_message: errorMessage,
      next_check_at: nextCheckAt,
      updated_at: now
    })
    .where(eq(arknightsApkHostRuns.id, id))
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
  }
): Promise<void> {
  await createDatabase(db)
    .update(arknightsApkHostRuns)
    .set({
      status: input.status,
      last_checked_at: input.now,
      last_log_tail: input.logTail,
      next_check_at: input.nextCheckAt,
      error_message: input.errorMessage,
      updated_at: input.now
    })
    .where(eq(arknightsApkHostRuns.id, id))
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
  await createDatabase(db)
    .update(arknightsApkHostRuns)
    .set({
      status: input.status,
      last_checked_at: input.now,
      last_log_tail: input.logTail,
      last_ai_status: input.aiStatus,
      last_ai_reason: input.aiReason,
      next_check_at: input.nextCheckAt,
      error_message: input.errorMessage,
      updated_at: input.now
    })
    .where(eq(arknightsApkHostRuns.id, id))
    .run();
}

export async function listRunsForRelease(
  db: D1Database,
  releaseId: number
): Promise<ArknightsApkHostRunRow[]> {
  return createDatabase(db)
    .select()
    .from(arknightsApkHostRuns)
    .where(eq(arknightsApkHostRuns.release_id, releaseId))
    .orderBy(asc(arknightsApkHostRuns.host_id), asc(arknightsApkHostRuns.id))
    .all();
}

export async function getHostRun(db: D1Database, id: number): Promise<ArknightsApkHostRunRow | null> {
  return (
    (await createDatabase(db)
      .select()
      .from(arknightsApkHostRuns)
      .where(eq(arknightsApkHostRuns.id, id))
      .get()) ?? null
  );
}
