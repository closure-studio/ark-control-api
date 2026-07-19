import { and, eq, lte } from "drizzle-orm";

import { createDatabase } from "../../db/client";
import { arknightsMaintenanceAnnouncements } from "../../db/schema";
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
    .insert(arknightsMaintenanceAnnouncements)
    .values({
      news_id: link.id,
      url: link.url,
      processing_state: "processing",
      claim_expires_at: claimExpiresAt,
      first_seen_at: now
    })
    .onConflictDoNothing({ target: arknightsMaintenanceAnnouncements.news_id })
    .returning({ newsId: arknightsMaintenanceAnnouncements.news_id })
    .get();

  if (inserted) return true;

  await createDatabase(db)
    .update(arknightsMaintenanceAnnouncements)
    .set({
      processing_state: "failed",
      processed_at: now,
      title: "Announcement processing claim expired",
      is_maintenance: false,
      error_message: "Previous processing claim expired before it reached a terminal state."
    })
    .where(
      and(
        eq(arknightsMaintenanceAnnouncements.news_id, link.id),
        eq(arknightsMaintenanceAnnouncements.processing_state, "processing"),
        lte(arknightsMaintenanceAnnouncements.claim_expires_at, now)
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
    .update(arknightsMaintenanceAnnouncements)
    .set({
      processing_state: outcome.processingState,
      processed_at: outcome.processedAt,
      title: outcome.title,
      is_maintenance: outcome.isMaintenance,
      maintenance_start: outcome.maintenanceStart,
      maintenance_end: outcome.maintenanceEnd,
      notified: outcome.notified,
      error_message: outcome.errorMessage
    })
    .where(
      and(
        eq(arknightsMaintenanceAnnouncements.news_id, newsId),
        eq(arknightsMaintenanceAnnouncements.processing_state, "processing")
      )
    )
    .returning({ newsId: arknightsMaintenanceAnnouncements.news_id })
    .get();

  if (!updated) {
    throw new Error(`Maintenance announcement ${newsId} was not in processing state.`);
  }
}
