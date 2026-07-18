import { and, eq, lte } from "drizzle-orm";

import { createDatabase } from "../../db/client";
import { maintenanceAnnouncements } from "../../db/schema";
import type {
  MaintenanceAnnouncementOutcome,
  NewsLink
} from "../../schemas/maintenance/announcements";

export async function claimMaintenanceAnnouncement(
  db: D1Database,
  link: NewsLink,
  now: string,
  claimExpiresAt: string
): Promise<boolean> {
  const inserted = await createDatabase(db)
    .insert(maintenanceAnnouncements)
    .values({
      news_id: link.id,
      url: link.url,
      processing_state: "processing",
      claimed_at: now,
      claim_expires_at: claimExpiresAt,
      first_seen_at: now
    })
    .onConflictDoNothing({ target: maintenanceAnnouncements.news_id })
    .returning({ newsId: maintenanceAnnouncements.news_id })
    .get();

  if (inserted) return true;

  await createDatabase(db)
    .update(maintenanceAnnouncements)
    .set({
      processing_state: "failed",
      processed_at: now,
      title: "Announcement processing claim expired",
      is_maintenance: false,
      reason: "Previous processing claim expired before it reached a terminal state.",
      summary: "公告处理任务未完成，已跳过以避免重复外部通知。",
      notify_error: "Previous processing claim expired."
    })
    .where(
      and(
        eq(maintenanceAnnouncements.news_id, link.id),
        eq(maintenanceAnnouncements.processing_state, "processing"),
        lte(maintenanceAnnouncements.claim_expires_at, now)
      )
    )
    .run();

  return false;
}

export async function completeMaintenanceAnnouncement(
  db: D1Database,
  newsId: string,
  outcome: MaintenanceAnnouncementOutcome
): Promise<void> {
  await updateAnnouncement(db, newsId, outcome);
}

export async function failMaintenanceAnnouncement(
  db: D1Database,
  newsId: string,
  outcome: MaintenanceAnnouncementOutcome
): Promise<void> {
  await updateAnnouncement(db, newsId, outcome);
}

async function updateAnnouncement(
  db: D1Database,
  newsId: string,
  outcome: MaintenanceAnnouncementOutcome
): Promise<void> {
  const updated = await createDatabase(db)
    .update(maintenanceAnnouncements)
    .set({
      processing_state: outcome.processingState,
      processed_at: outcome.processedAt,
      title: outcome.title,
      is_maintenance: outcome.isMaintenance,
      maintenance_start: outcome.maintenanceStart,
      maintenance_end: outcome.maintenanceEnd,
      notified: outcome.notified,
      notify_channel: outcome.notifyChannel,
      reason: outcome.reason,
      summary: outcome.summary,
      notify_error: outcome.notifyError
    })
    .where(
      and(
        eq(maintenanceAnnouncements.news_id, newsId),
        eq(maintenanceAnnouncements.processing_state, "processing")
      )
    )
    .returning({ newsId: maintenanceAnnouncements.news_id })
    .get();

  if (!updated) {
    throw new Error(`Maintenance announcement ${newsId} was not in processing state.`);
  }
}
