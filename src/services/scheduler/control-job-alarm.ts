import { DurableObject } from "cloudflare:workers";
import * as v from "valibot";

import { ControlJobNameSchema, type ControlJobName } from "../../schemas/scheduler/jobs";
import type { Env } from "../../schemas/env";
import {
  getNextApkDeliveryAlarmAt,
  runApkDeliveryCycle
} from "../apk-delivery/deployment-lifecycle";
import { runMaintenanceMonitor } from "../maintenance/monitor";
import { runDueMaintenancePreActions } from "../maintenance/pre-action";
import { getNextMaintenancePreActionAt } from "../../repositories/maintenance/pre-actions";
import { runRetentionCleanup } from "../retention";
import { collectPublicAnnouncements, nextPublicAnnouncementAlarm } from "../public-announcements/collector";
import { nextUtcHour, nextUtcMidnight } from "./time";

const MAX_PLATFORM_RETRY_COUNT = 6;
const ALARM_RECOVERY_DELAY_MS = 5 * 60 * 1000;

export class ControlJobAlarm extends DurableObject<Env> {
  private alarmRunning = false;
  private generation = 0;
  private refreshRequested = false;

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/ensure") {
      return new Response("Not found", { status: 404 });
    }
    if (this.alarmRunning) {
      this.refreshRequested = true;
      return new Response(null, { status: 202 });
    }

    const generation = ++this.generation;
    const job = this.jobName();
    const desired = await this.desiredAlarm(job, new Date());
    if (generation !== this.generation || this.alarmRunning) {
      this.refreshRequested = true;
      return new Response(null, { status: 202 });
    }

    const current = await this.ctx.storage.getAlarm();
    if (generation !== this.generation || this.alarmRunning) {
      this.refreshRequested = true;
      return new Response(null, { status: 202 });
    }
    if (desired === null) {
      if (current !== null) await this.ctx.storage.deleteAlarm();
    } else if (current === null || desired.getTime() < current) {
      await this.ctx.storage.setAlarm(desired);
    }
    console.info("Control job alarm ensured", {
      jobName: job,
      currentAlarmAt: current === null ? null : new Date(current).toISOString(),
      desiredAlarmAt: desired?.toISOString() ?? null
    });
    return new Response(null, { status: 204 });
  }

  override async alarm(alarmInfo?: AlarmInvocationInfo): Promise<void> {
    this.alarmRunning = true;
    this.refreshRequested = false;
    ++this.generation;
    const job = this.jobName();
    const startedAt = new Date();
    console.info("Control job alarm started", {
      jobName: job,
      scheduledAt: alarmInfo === undefined ? null : new Date(alarmInfo.scheduledTime).toISOString(),
      startedAt: startedAt.toISOString(),
      isRetry: alarmInfo?.isRetry ?? false,
      retryCount: alarmInfo?.retryCount ?? 0
    });

    let next: Date | null | undefined;
    let outcome: "completed" | "recovery_scheduled" = "completed";

    try {
      next = await this.runJob(job, startedAt);
    } catch (error) {
      const retryCount = alarmInfo?.retryCount ?? MAX_PLATFORM_RETRY_COUNT;
      const usePlatformRetry = retryCount < MAX_PLATFORM_RETRY_COUNT;
      console.error("Control job alarm failed", {
        jobName: job,
        outcome: usePlatformRetry ? "platform_retry" : "recovery_scheduled",
        error: error instanceof Error ? error.message : "unknown alarm failure",
        retryCount,
        durationMs: Date.now() - startedAt.getTime()
      });
      if (usePlatformRetry) throw error;

      outcome = "recovery_scheduled";
      this.refreshRequested = false;
      next = new Date(Date.now() + ALARM_RECOVERY_DELAY_MS);
    } finally {
      try {
        if (next !== undefined) {
          next =
            outcome === "completed"
              ? await this.setNextAlarmWithRefresh(job, next)
              : await this.setNextAlarm(next);
        }
      } finally {
        this.alarmRunning = false;
      }
    }

    const completedAt = new Date();
    console.info("Control job alarm completed", {
      jobName: job,
      outcome,
      completedAt: completedAt.toISOString(),
      nextAlarmAt: next?.toISOString() ?? null,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      refreshRequested: this.refreshRequested
    });
  }

  private jobName(): ControlJobName {
    return v.parse(ControlJobNameSchema, this.ctx.id.name);
  }

  private async desiredAlarm(job: ControlJobName, now: Date): Promise<Date | null> {
    if (job === "apk-delivery") return getNextApkDeliveryAlarmAt(this.env.DB, now);
    if (job === "maintenance-monitor") return nextUtcHour(now);
    if (job === "public-announcements") return nextPublicAnnouncementAlarm(this.env.DB, now);
    if (job === "maintenance-pre-action") {
      return getNextMaintenancePreActionAt(this.env.DB, now);
    }
    return nextUtcMidnight(now);
  }

  private async runJob(job: ControlJobName, startedAt: Date): Promise<Date | null> {
    if (job === "apk-delivery") return runApkDeliveryCycle(this.env);
    if (job === "public-announcements") return collectPublicAnnouncements(this.env.DB);
    if (job === "maintenance-monitor") {
      await runMaintenanceMonitor(this.env);
      return nextUtcHour(new Date());
    }
    if (job === "maintenance-pre-action") {
      await runDueMaintenancePreActions(this.env, startedAt);
      return getNextMaintenancePreActionAt(this.env.DB, new Date());
    }
    await runRetentionCleanup(this.env);
    return nextUtcMidnight(new Date());
  }

  private async setNextAlarmWithRefresh(
    job: ControlJobName,
    candidate: Date | null
  ): Promise<Date | null> {
    let next = candidate;
    while (true) {
      if (this.refreshRequested) {
        this.refreshRequested = false;
        next = earlierAlarm(next, await this.desiredAlarm(job, new Date()));
      }
      await this.setNextAlarm(next);
      if (!this.refreshRequested) return next;
    }
  }

  private async setNextAlarm(next: Date | null): Promise<Date | null> {
    if (next === null) {
      await this.ctx.storage.deleteAlarm();
      return null;
    }
    await this.ctx.storage.setAlarm(next);
    return next;
  }
}

function earlierAlarm(left: Date | null, right: Date | null): Date | null {
  if (left === null) return right;
  if (right === null) return left;
  return left.getTime() <= right.getTime() ? left : right;
}
