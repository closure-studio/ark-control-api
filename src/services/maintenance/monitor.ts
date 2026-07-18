import * as v from "valibot";

import {
  MAINTENANCE_CLAIM_TTL_MS,
  MAINTENANCE_LOCK_KEY,
  MAINTENANCE_LOCK_TTL_MS
} from "../../constants/maintenance/config";
import {
  acquireControlJobLock,
  releaseControlJobLock
} from "../../repositories/control-job-locks";
import {
  claimMaintenanceAnnouncement,
  completeMaintenanceAnnouncement,
  failMaintenanceAnnouncement
} from "../../repositories/maintenance/announcements";
import type { Env } from "../../schemas/env";
import {
  MaintenanceAnnouncementOutcomeSchema,
  MaintenanceNotificationResultSchema,
  type ClassificationResult,
  type MaintenanceAnnouncementOutcome,
  type MaintenanceNotificationResult,
  type NewsDetail,
  type NewsLink
} from "../../schemas/maintenance/announcements";
import { classifyByRules } from "../../utils/maintenance/rules";
import { classifyMaintenanceWithAi } from "./ai";
import { notifyMaintenance } from "./notification";
import { fetchMaintenanceNewsDetail, fetchMaintenanceNewsLinks } from "./news";

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
  claim: (link: NewsLink, now: string, claimExpiresAt: string) => Promise<boolean>;
  complete: (newsId: string, outcome: MaintenanceAnnouncementOutcome) => Promise<void>;
  fail: (newsId: string, outcome: MaintenanceAnnouncementOutcome) => Promise<void>;
  logger: MaintenanceLogger;
};

type MaintenanceLockDependencies = MaintenanceMonitorDependencies & {
  acquireLock: (input: { owner: string; expiresAt: string; now: string }) => Promise<boolean>;
  releaseLock: (input: { owner: string }) => Promise<void>;
};

export async function runMaintenanceMonitor(env: Env): Promise<void> {
  const dependencies = createMaintenanceMonitorDependencies(env);
  const now = dependencies.now();
  const nowIso = now.toISOString();
  const owner = createLockOwner(now);
  const lockExpiresAt = addMs(now, MAINTENANCE_LOCK_TTL_MS);

  if (!(await dependencies.acquireLock({ owner, expiresAt: lockExpiresAt, now: nowIso }))) {
    dependencies.logger.info("Maintenance monitor skipped because another run owns the lock");
    return;
  }

  try {
    await runMaintenanceMonitorWithDependencies(dependencies);
  } finally {
    await dependencies.releaseLock({ owner });
  }
}

export async function runMaintenanceMonitorWithDependencies(
  dependencies: MaintenanceMonitorDependencies
): Promise<void> {
  const links = await dependencies.fetchLinks();
  dependencies.logger.info("Maintenance news links extracted", { count: links.length });

  let processedCount = 0;
  for (const link of links) {
    const now = dependencies.now();
    const nowIso = now.toISOString();
    const claimed = await dependencies.claim(link, nowIso, addMs(now, MAINTENANCE_CLAIM_TTL_MS));
    if (!claimed) continue;

    processedCount += 1;
    dependencies.logger.info("Processing new maintenance announcement", {
      id: link.id,
      url: link.url
    });

    let outcome: MaintenanceAnnouncementOutcome;
    try {
      const detail = await dependencies.fetchDetail(link);
      const rules = dependencies.classifyRules(detail);
      const classification =
        rules.status === "uncertain" ? await dependencies.classifyAi(detail) : rules;
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
        notifyChannel: notification.notifyChannel,
        reason: classification.reason,
        summary: classification.summary,
        notifyError: notification.notifyError
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
        notifyChannel: null,
        reason: `Announcement processing failed: ${message}`,
        summary: "单条公告处理失败，已跳过以避免阻塞整体监控。",
        notifyError: null
      });
    }

    if (outcome.processingState === "completed") {
      await dependencies.complete(link.id, outcome);
    } else {
      await dependencies.fail(link.id, outcome);
    }
  }

  dependencies.logger.info("Maintenance monitor completed", { processedCount });
}

function createMaintenanceMonitorDependencies(env: Env): MaintenanceLockDependencies {
  return {
    now: () => new Date(),
    acquireLock: ({ owner, expiresAt, now }) =>
      acquireControlJobLock(env.DB, MAINTENANCE_LOCK_KEY, owner, expiresAt, now),
    releaseLock: ({ owner }) => releaseControlJobLock(env.DB, MAINTENANCE_LOCK_KEY, owner),
    fetchLinks: () => fetchMaintenanceNewsLinks(),
    fetchDetail: (link) => fetchMaintenanceNewsDetail(link),
    classifyRules: (news) => classifyByRules(news),
    classifyAi: (news) => classifyMaintenanceWithAi(env, news),
    notify: (news, classification) => notifyMaintenance(env, news, classification),
    claim: (link, now, claimExpiresAt) =>
      claimMaintenanceAnnouncement(env.DB, link, now, claimExpiresAt),
    complete: (newsId, outcome) => completeMaintenanceAnnouncement(env.DB, newsId, outcome),
    fail: (newsId, outcome) => failMaintenanceAnnouncement(env.DB, newsId, outcome),
    logger: console
  };
}

function createLockOwner(now: Date): string {
  return `maintenance:${now.getTime()}:${Math.random().toString(36).slice(2, 10)}`;
}

function addMs(date: Date, milliseconds: number): string {
  return new Date(date.getTime() + milliseconds).toISOString();
}

function emptyNotificationResult(): MaintenanceNotificationResult {
  return v.parse(MaintenanceNotificationResultSchema, {
    notified: false,
    notifyChannel: null,
    notifyError: null
  });
}
