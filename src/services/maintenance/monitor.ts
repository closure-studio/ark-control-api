import * as v from "valibot";

import {
  claimMaintenanceAnnouncement,
  completeMaintenanceAnnouncement,
  failInterruptedMaintenanceAnnouncements,
  failMaintenanceAnnouncement,
  recordMaintenanceAnnouncementClassification
} from "../../repositories/maintenance/announcements";
import type { Env } from "../../schemas/env";
import {
  MaintenanceAnnouncementOutcomeSchema,
  MaintenanceAnnouncementClassificationSchema,
  MaintenanceNotificationResultSchema,
  type ClassificationResult,
  type MaintenanceAnnouncementClassification,
  type MaintenanceAnnouncementOutcome,
  type MaintenanceNotificationResult,
  type NewsDetail,
  type NewsLink
} from "../../schemas/maintenance/announcements";
import { classifyByRules } from "../../utils/maintenance/rules";
import { buildMaintenancePreActionSchedule } from "../../utils/maintenance/pre-action-schedule";
import { classifyMaintenanceWithAi } from "./ai";
import { notifyMaintenance } from "./notification";
import { fetchMaintenanceNewsDetail, fetchMaintenanceNewsLinks } from "./news";
import { refreshMaintenancePreActionAlarm } from "../scheduler/client";

type MaintenanceLogger = Pick<Console, "info" | "warn" | "error">;

type MaintenanceMonitorDependencies = {
  now: () => Date;
  fetchLinks: () => Promise<NewsLink[]>;
  fetchDetail: (link: NewsLink) => Promise<NewsDetail>;
  classifyRules: (news: Pick<NewsDetail, "title" | "content">) => ClassificationResult;
  classifyAi: (news: NewsDetail) => Promise<ClassificationResult>;
  notify: (
    news: NewsDetail,
    classification: ClassificationResult
  ) => Promise<MaintenanceNotificationResult>;
  claim: (link: NewsLink, now: string) => Promise<boolean>;
  recordClassification: (
    newsId: string,
    classification: MaintenanceAnnouncementClassification
  ) => Promise<void>;
  complete: (newsId: string, outcome: MaintenanceAnnouncementOutcome) => Promise<void>;
  fail: (newsId: string, outcome: MaintenanceAnnouncementOutcome) => Promise<void>;
  refreshPreActionAlarm?: () => Promise<void>;
  logger: MaintenanceLogger;
};

export async function runMaintenanceMonitor(env: Env): Promise<void> {
  await failInterruptedMaintenanceAnnouncements(env.DB, new Date().toISOString());
  const dependencies = createMaintenanceMonitorDependencies(env);
  await runMaintenanceMonitorWithDependencies(dependencies);
}

export async function runMaintenanceMonitorWithDependencies(
  dependencies: MaintenanceMonitorDependencies
): Promise<void> {
  const links = await dependencies.fetchLinks();
  dependencies.logger.info("Maintenance news links extracted", { count: links.length });

  let processedCount = 0;
  for (const link of links) {
    const claimed = await dependencies.claim(link, dependencies.now().toISOString());
    if (!claimed) continue;

    processedCount += 1;
    dependencies.logger.info("Processing new maintenance announcement", {
      id: link.id,
      url: link.url
    });

    let outcome: MaintenanceAnnouncementOutcome;
    let scheduledPreAction = false;
    try {
      const detail = await dependencies.fetchDetail(link);
      const rules = dependencies.classifyRules(detail);
      const classification =
        rules.status === "uncertain" ? await dependencies.classifyAi(detail) : rules;
      const announcementClassification = buildAnnouncementClassification(
        detail,
        classification,
        rules
      );
      scheduledPreAction = announcementClassification.preActionState === "pending";
      await dependencies.recordClassification(link.id, announcementClassification);
      const notification = classification.isMaintenance
        ? await dependencies.notify(detail, classification)
        : emptyNotificationResult();

      outcome = v.parse(MaintenanceAnnouncementOutcomeSchema, {
        processingState: "completed",
        processedAt: dependencies.now().toISOString(),
        title: detail.title,
        isMaintenance: classification.isMaintenance,
        maintenanceStart: classification.maintenanceStart,
        maintenanceEnd: classification.maintenanceEnd,
        notified: notification.notified,
        errorMessage: notification.notifyError
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "announcement processing failed";
      dependencies.logger.warn("Maintenance announcement processing failed", {
        id: link.id,
        error: message
      });
      outcome = v.parse(MaintenanceAnnouncementOutcomeSchema, {
        processingState: "failed",
        processedAt: dependencies.now().toISOString(),
        title: `Failed to fetch announcement ${link.id}`,
        isMaintenance: false,
        maintenanceStart: null,
        maintenanceEnd: null,
        notified: false,
        errorMessage: `Announcement processing failed: ${message}`
      });
    }

    if (outcome.processingState === "completed") {
      await dependencies.complete(link.id, outcome);
      if (scheduledPreAction && dependencies.refreshPreActionAlarm !== undefined) {
        try {
          await dependencies.refreshPreActionAlarm();
        } catch (error) {
          dependencies.logger.warn("Maintenance pre-action alarm refresh failed", {
            id: link.id,
            error: error instanceof Error ? error.message : "alarm refresh failed"
          });
        }
      }
    } else {
      await dependencies.fail(link.id, outcome);
    }
  }

  dependencies.logger.info("Maintenance monitor completed", { processedCount });
}

function createMaintenanceMonitorDependencies(env: Env): MaintenanceMonitorDependencies {
  return {
    now: () => new Date(),
    fetchLinks: () => fetchMaintenanceNewsLinks(),
    fetchDetail: (link) => fetchMaintenanceNewsDetail(link),
    classifyRules: (news) => classifyByRules(news),
    classifyAi: (news) => classifyMaintenanceWithAi(env, news),
    notify: (news, classification) => notifyMaintenance(env, news, classification),
    claim: (link, now) => claimMaintenanceAnnouncement(env.DB, link, now),
    recordClassification: (newsId, classification) =>
      recordMaintenanceAnnouncementClassification(env.DB, newsId, classification),
    complete: (newsId, outcome) => completeMaintenanceAnnouncement(env.DB, newsId, outcome),
    fail: (newsId, outcome) => failMaintenanceAnnouncement(env.DB, newsId, outcome),
    refreshPreActionAlarm: () => refreshMaintenancePreActionAlarm(env.CONTROL_JOB_ALARMS),
    logger: console
  };
}

function buildAnnouncementClassification(
  detail: NewsDetail,
  classification: ClassificationResult,
  rules: ClassificationResult
): MaintenanceAnnouncementClassification {
  const schedule =
    rules.status === "maintenance"
      ? buildMaintenancePreActionSchedule(rules.maintenanceStart)
      : null;
  const deterministicScheduleFailed = rules.status === "maintenance" && schedule === null;
  return v.parse(MaintenanceAnnouncementClassificationSchema, {
    title: detail.title,
    isMaintenance: classification.isMaintenance,
    maintenanceStart: classification.maintenanceStart,
    maintenanceEnd: classification.maintenanceEnd,
    maintenanceStartAt: schedule?.maintenanceStartAt ?? null,
    preActionAt: schedule?.preActionAt ?? null,
    preActionState: schedule === null ? "unschedulable" : "pending",
    preActionFailureStep: deterministicScheduleFailed ? "schedule" : null,
    preActionErrorMessage: deterministicScheduleFailed
      ? "Deterministic maintenance announcement did not contain a complete valid start time."
      : null
  });
}

function emptyNotificationResult(): MaintenanceNotificationResult {
  return v.parse(MaintenanceNotificationResultSchema, {
    notified: false,
    notifyChannel: null,
    notifyError: null
  });
}
