import * as v from "valibot";

import { MAINTENANCE_REQUEST_TIMEOUT_MS } from "../../constants/maintenance/config";
import type { Env } from "../../schemas/env";
import {
  MaintenanceNotificationResultSchema,
  type ClassificationResult,
  type MaintenanceNotificationResult,
  type NewsDetail
} from "../../schemas/maintenance/announcements";
import { sendQqBotAutoMessage } from "../notifications/qq-bot";

export async function notifyMaintenance(
  env: Env,
  news: NewsDetail,
  classification: ClassificationResult,
  fetcher?: typeof fetch
): Promise<MaintenanceNotificationResult> {
  try {
    await sendQqBotAutoMessage(env, buildMaintenanceMessage(news, classification), {
      timeoutMs: MAINTENANCE_REQUEST_TIMEOUT_MS,
      ...(fetcher !== undefined ? { fetcher } : {})
    });

    return v.parse(MaintenanceNotificationResultSchema, {
      notified: true,
      notifyChannel: "qqbot",
      notifyError: null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "notification failed";
    console.warn("maintenance notification failed", { newsId: news.id, error: message });
    return v.parse(MaintenanceNotificationResultSchema, {
      notified: false,
      notifyChannel: null,
      notifyError: message
    });
  }
}

export function buildMaintenanceMessage(
  news: NewsDetail,
  classification: ClassificationResult
): string {
  const start = classification.maintenanceStart || "未提取，请查看原文";
  const end = classification.maintenanceEnd || "未提取，请查看原文";
  return [
    "【明日方舟停机维护提醒】",
    "",
    "标题：",
    news.title,
    "",
    "维护时间：",
    `${start} ~ ${end}`,
    "",
    "摘要：",
    classification.summary,
    "",
    "原因：",
    classification.reason,
    "",
    "链接：",
    news.url
  ].join("\n");
}
