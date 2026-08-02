import { and, eq } from "drizzle-orm";

import { createDatabase } from "../../db/client";
import { arknightsMaintenanceAnnouncements } from "../../db/schema";
import type {
  MaintenanceAnnouncementClassification,
  MaintenanceAnnouncementOutcome,
  NewsLink
} from "../../schemas/maintenance/announcements";

export async function claimMaintenanceAnnouncement(
  db: D1Database,
  link: NewsLink,
  now: string
): Promise<boolean> {
  const inserted = await createDatabase(db)
    .insert(arknightsMaintenanceAnnouncements)
    .values({
      news_id: link.id,
      url: link.url,
      processing_state: "processing",
      first_seen_at: now
    })
    .onConflictDoNothing({ target: arknightsMaintenanceAnnouncements.news_id })
    .returning({ newsId: arknightsMaintenanceAnnouncements.news_id })
    .get();

  return Boolean(inserted);
}

export async function failInterruptedMaintenanceAnnouncements(
  db: D1Database,
  now: string
): Promise<void> {
  await createDatabase(db)
    .update(arknightsMaintenanceAnnouncements)
    .set({
      processing_state: "failed",
      processed_at: now,
      error_message: "Announcement processing was interrupted before reaching a terminal state."
    })
    .where(eq(arknightsMaintenanceAnnouncements.processing_state, "processing"))
    .run();
}

export async function completeMaintenanceAnnouncement(
  db: D1Database,
  newsId: string,
  outcome: MaintenanceAnnouncementOutcome
): Promise<void> {
  await updateAnnouncement(db, newsId, outcome);
}

export async function recordMaintenanceAnnouncementClassification(
  db: D1Database,
  newsId: string,
  classification: MaintenanceAnnouncementClassification
): Promise<void> {
  const updated = await createDatabase(db)
    .update(arknightsMaintenanceAnnouncements)
    .set({
      title: classification.title,
      is_maintenance: classification.isMaintenance,
      maintenance_start: classification.maintenanceStart,
      maintenance_end: classification.maintenanceEnd,
      maintenance_start_at: classification.maintenanceStartAt,
      pre_action_at: classification.preActionAt,
      pre_action_state: classification.preActionState,
      pre_action_failed_step: classification.preActionFailureStep,
      pre_action_error_message: classification.preActionErrorMessage
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
