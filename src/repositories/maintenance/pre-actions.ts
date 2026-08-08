import { and, asc, eq, gt, inArray, isNotNull, lte } from "drizzle-orm";

import { createDatabase } from "../../db/client";
import {
  arknightsMaintenanceAnnouncements,
  arknightsMaintenanceHostRuns,
  type ArknightsMaintenanceAnnouncementRow
} from "../../db/schema";
import type { MaintenancePreActionFailureStep } from "../../schemas/maintenance/announcements";
import type { ExecuteHostCommandResult } from "../../schemas/vps/ssh-command";
import type { VpsHostRecord } from "../vps/vps-hosts";

export async function failInterruptedMaintenancePreActions(
  db: D1Database,
  now: string
): Promise<ArknightsMaintenanceAnnouncementRow[]> {
  const interrupted = await createDatabase(db)
    .update(arknightsMaintenanceAnnouncements)
    .set({
      pre_action_state: "failed",
      pre_action_completed_at: now,
      pre_action_failed_step: "interrupted",
      pre_action_error_message: "Maintenance pre-action was interrupted before completion."
    })
    .where(eq(arknightsMaintenanceAnnouncements.pre_action_state, "processing"))
    .returning()
    .all();

  const newsIds = interrupted.map((row) => row.news_id);
  if (newsIds.length === 0) return [];
  await createDatabase(db)
    .update(arknightsMaintenanceHostRuns)
    .set({
      status: "failed",
      error_message: "Maintenance pre-action was interrupted before SSH completion.",
      updated_at: now
    })
    .where(
      and(
        inArray(arknightsMaintenanceHostRuns.announcement_news_id, newsIds),
        eq(arknightsMaintenanceHostRuns.status, "running")
      )
    )
    .run();
  return interrupted;
}

export async function failMissedMaintenancePreActions(
  db: D1Database,
  now: string
): Promise<ArknightsMaintenanceAnnouncementRow[]> {
  return createDatabase(db)
    .update(arknightsMaintenanceAnnouncements)
    .set({
      pre_action_state: "failed",
      pre_action_completed_at: now,
      pre_action_failed_step: "missed",
      pre_action_error_message: "Maintenance started before its pre-action could run."
    })
    .where(
      and(
        eq(arknightsMaintenanceAnnouncements.processing_state, "completed"),
        eq(arknightsMaintenanceAnnouncements.is_maintenance, true),
        eq(arknightsMaintenanceAnnouncements.pre_action_state, "pending"),
        isNotNull(arknightsMaintenanceAnnouncements.maintenance_start_at),
        lte(arknightsMaintenanceAnnouncements.maintenance_start_at, now)
      )
    )
    .returning()
    .all();
}

export async function claimDueMaintenancePreAction(
  db: D1Database,
  now: string
): Promise<ArknightsMaintenanceAnnouncementRow | null> {
  const database = createDatabase(db);
  const candidate = await database
    .select({ newsId: arknightsMaintenanceAnnouncements.news_id })
    .from(arknightsMaintenanceAnnouncements)
    .where(
      and(
        eq(arknightsMaintenanceAnnouncements.processing_state, "completed"),
        eq(arknightsMaintenanceAnnouncements.is_maintenance, true),
        eq(arknightsMaintenanceAnnouncements.pre_action_state, "pending"),
        isNotNull(arknightsMaintenanceAnnouncements.pre_action_at),
        lte(arknightsMaintenanceAnnouncements.pre_action_at, now),
        isNotNull(arknightsMaintenanceAnnouncements.maintenance_start_at),
        gt(arknightsMaintenanceAnnouncements.maintenance_start_at, now)
      )
    )
    .orderBy(
      asc(arknightsMaintenanceAnnouncements.pre_action_at),
      asc(arknightsMaintenanceAnnouncements.news_id)
    )
    .limit(1)
    .get();
  if (!candidate) return null;

  return (
    (await database
      .update(arknightsMaintenanceAnnouncements)
      .set({
        pre_action_state: "processing",
        pre_action_started_at: now,
        pre_action_completed_at: null,
        pre_action_failed_step: null,
        pre_action_error_message: null
      })
      .where(
        and(
          eq(arknightsMaintenanceAnnouncements.news_id, candidate.newsId),
          eq(arknightsMaintenanceAnnouncements.pre_action_state, "pending")
        )
      )
      .returning()
      .get()) ?? null
  );
}

export async function getNextMaintenancePreActionAt(
  db: D1Database,
  now: Date
): Promise<Date | null> {
  const candidate = await createDatabase(db)
    .select({
      preActionAt: arknightsMaintenanceAnnouncements.pre_action_at,
      maintenanceStartAt: arknightsMaintenanceAnnouncements.maintenance_start_at
    })
    .from(arknightsMaintenanceAnnouncements)
    .where(
      and(
        eq(arknightsMaintenanceAnnouncements.processing_state, "completed"),
        eq(arknightsMaintenanceAnnouncements.is_maintenance, true),
        eq(arknightsMaintenanceAnnouncements.pre_action_state, "pending"),
        isNotNull(arknightsMaintenanceAnnouncements.pre_action_at),
        isNotNull(arknightsMaintenanceAnnouncements.maintenance_start_at)
      )
    )
    .orderBy(
      asc(arknightsMaintenanceAnnouncements.pre_action_at),
      asc(arknightsMaintenanceAnnouncements.news_id)
    )
    .limit(1)
    .get();
  if (!candidate) return null;
  if (candidate.preActionAt === null || candidate.maintenanceStartAt === null) return now;

  const preActionAt = Date.parse(candidate.preActionAt);
  const maintenanceStartAt = Date.parse(candidate.maintenanceStartAt);
  if (!Number.isFinite(preActionAt) || !Number.isFinite(maintenanceStartAt)) return now;
  if (preActionAt <= now.getTime() || maintenanceStartAt <= now.getTime()) return now;
  return new Date(preActionAt);
}

export async function completeMaintenancePreAction(
  db: D1Database,
  newsId: string,
  now: string
): Promise<void> {
  await finalizeMaintenancePreAction(db, newsId, {
    state: "completed",
    now,
    failureStep: null,
    errorMessage: null
  });
}

export async function failMaintenancePreAction(
  db: D1Database,
  newsId: string,
  now: string,
  failureStep: MaintenancePreActionFailureStep,
  errorMessage: string
): Promise<void> {
  await finalizeMaintenancePreAction(db, newsId, {
    state: "failed",
    now,
    failureStep,
    errorMessage
  });
}

async function finalizeMaintenancePreAction(
  db: D1Database,
  newsId: string,
  result: {
    state: "completed" | "failed";
    now: string;
    failureStep: MaintenancePreActionFailureStep | null;
    errorMessage: string | null;
  }
): Promise<void> {
  const updated = await createDatabase(db)
    .update(arknightsMaintenanceAnnouncements)
    .set({
      pre_action_state: result.state,
      pre_action_completed_at: result.now,
      pre_action_failed_step: result.failureStep,
      pre_action_error_message: result.errorMessage
    })
    .where(
      and(
        eq(arknightsMaintenanceAnnouncements.news_id, newsId),
        eq(arknightsMaintenanceAnnouncements.pre_action_state, "processing")
      )
    )
    .returning({ newsId: arknightsMaintenanceAnnouncements.news_id })
    .get();
  if (!updated) throw new Error(`Maintenance pre-action ${newsId} lost its claim.`);
}

export async function createMaintenanceHostRun(
  db: D1Database,
  newsId: string,
  host: VpsHostRecord,
  now: string
): Promise<number> {
  const row = await createDatabase(db)
    .insert(arknightsMaintenanceHostRuns)
    .values({
      announcement_news_id: newsId,
      host_id: host.id,
      host_name_snapshot: host.name,
      host_address_snapshot: host.address,
      status: "running",
      created_at: now,
      updated_at: now
    })
    .returning({ id: arknightsMaintenanceHostRuns.id })
    .get();
  return row.id;
}

export async function finishMaintenanceHostRun(
  db: D1Database,
  runId: number,
  result: ExecuteHostCommandResult,
  now: string
): Promise<void> {
  const status = result.success ? "succeeded" : result.timedOut ? "timed_out" : "failed";
  await createDatabase(db)
    .update(arknightsMaintenanceHostRuns)
    .set({
      status,
      connected: result.connected,
      timed_out: result.timedOut,
      exit_code: result.exitCode,
      error_message: result.success ? null : hostResultError(result),
      updated_at: now
    })
    .where(eq(arknightsMaintenanceHostRuns.id, runId))
    .run();
}

export async function failMaintenanceHostRun(
  db: D1Database,
  runId: number,
  errorMessage: string,
  now: string
): Promise<void> {
  await createDatabase(db)
    .update(arknightsMaintenanceHostRuns)
    .set({ status: "failed", error_message: errorMessage, updated_at: now })
    .where(eq(arknightsMaintenanceHostRuns.id, runId))
    .run();
}

function hostResultError(result: ExecuteHostCommandResult): string {
  if (result.timedOut) return "SSH restart command timed out.";
  if (!result.connected) return "SSH connection failed.";
  if (result.exitCode !== null) return `SSH restart command exited with code ${result.exitCode}.`;
  return "SSH restart command failed.";
}
