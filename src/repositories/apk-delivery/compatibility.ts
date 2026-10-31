import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";

import { createDatabase } from "../../db/client";
import {
  arknightsApkCompatibilityRuns,
  type ArknightsApkCompatibilityRunRow
} from "../../db/schema";
import type {
  CompatibilityRequest,
  CompatibilityStatus,
  GitHubRun
} from "../../schemas/apk-delivery/compatibility";

export async function getCompatibilityRun(
  db: D1Database,
  id: string
): Promise<ArknightsApkCompatibilityRunRow | null> {
  return (
    (await createDatabase(db)
      .select()
      .from(arknightsApkCompatibilityRuns)
      .where(eq(arknightsApkCompatibilityRuns.id, id))
      .get()) ?? null
  );
}

export async function createCompatibilityRun(
  db: D1Database,
  id: string,
  input: CompatibilityRequest,
  now: Date
): Promise<boolean> {
  const rows = await createDatabase(db)
    .insert(arknightsApkCompatibilityRuns)
    .values({
      id,
      apk_filename: input.apk_filename,
      final_url: input.apk_url,
      hook_commit: input.hook_sha,
      status: "queued",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      // Queue time and six hours of execution have separate budgets.
      deadline_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      next_check_at: new Date(now.getTime() + 60_000).toISOString()
    })
    .onConflictDoNothing()
    .returning({ id: arknightsApkCompatibilityRuns.id })
    .all();
  return rows.length > 0;
}

export async function claimCompatibilityDispatch(
  db: D1Database,
  id: string,
  now: Date
): Promise<boolean> {
  const rows = await createDatabase(db)
    .update(arknightsApkCompatibilityRuns)
    .set({ dispatch_attempted_at: now.toISOString() })
    .where(
      and(
        eq(arknightsApkCompatibilityRuns.id, id),
        isNull(arknightsApkCompatibilityRuns.dispatch_attempted_at)
      )
    )
    .returning({ id: arknightsApkCompatibilityRuns.id })
    .all();
  return rows.length > 0;
}

export async function attachCompatibilityRun(
  db: D1Database,
  id: string,
  runId: number,
  url: string,
  now: Date
): Promise<void> {
  await createDatabase(db)
    .update(arknightsApkCompatibilityRuns)
    .set({
      github_run_id: String(runId),
      github_url: url,
      updated_at: now.toISOString()
    })
    .where(eq(arknightsApkCompatibilityRuns.id, id))
    .run();
}

export async function saveCompatibilityRun(
  db: D1Database,
  row: ArknightsApkCompatibilityRunRow,
  status: CompatibilityStatus,
  remote: GitHubRun | null,
  error: string | null,
  now: Date
): Promise<void> {
  const deadline =
    status === "running" && row.status !== "running"
      ? new Date(now.getTime() + 6 * 60 * 60 * 1000 + 10 * 60_000).toISOString()
      : row.deadline_at;
  await createDatabase(db)
    .update(arknightsApkCompatibilityRuns)
    .set({
      status,
      error_message: error,
      updated_at: now.toISOString(),
      deadline_at: deadline,
      ...(remote
        ? { github_run_attempt: remote.run_attempt, report_json: JSON.stringify(remote) }
        : {}),
      next_check_at:
        status === "queued" || status === "running"
          ? new Date(now.getTime() + 60_000).toISOString()
          : null
    })
    .where(eq(arknightsApkCompatibilityRuns.id, row.id))
    .run();
}

export async function recordCompatibilityError(
  db: D1Database,
  row: ArknightsApkCompatibilityRunRow,
  message: string,
  now: Date
): Promise<void> {
  const expired = Date.parse(row.deadline_at) <= now.getTime();
  await saveCompatibilityRun(db, row, expired ? "timed_out" : row.status, null, message, now);
}

export async function dueCompatibilityRuns(
  db: D1Database,
  now: Date
): Promise<ArknightsApkCompatibilityRunRow[]> {
  return createDatabase(db)
    .select()
    .from(arknightsApkCompatibilityRuns)
    .where(
      and(
        inArray(arknightsApkCompatibilityRuns.status, ["queued", "running"]),
        lte(arknightsApkCompatibilityRuns.next_check_at, now.toISOString())
      )
    )
    .all();
}

export async function nextCompatibilityCheck(db: D1Database): Promise<string | null> {
  const row = await createDatabase(db)
    .select({ at: arknightsApkCompatibilityRuns.next_check_at })
    .from(arknightsApkCompatibilityRuns)
    .where(inArray(arknightsApkCompatibilityRuns.status, ["queued", "running"]))
    .orderBy(asc(arknightsApkCompatibilityRuns.next_check_at))
    .limit(1)
    .get();
  return row?.at ?? null;
}
