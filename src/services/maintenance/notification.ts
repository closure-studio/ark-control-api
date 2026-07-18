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
    if (typeof env.QQBOT_TOKEN !== "string" || env.QQBOT_TOKEN.trim().length === 0) {
      throw new Error("QQBOT_TOKEN is required");
    }

    await sendQqBotAutoMessage({
      token: env.QQBOT_TOKEN,
      uid: parseQqBotUid(env.QQBOT_UID),
      msg: buildMaintenanceMessage(news, classification),
      timeoutMs: MAINTENANCE_REQUEST_TIMEOUT_MS,
      ...(fetcher !== undefined ? { fetcher } : {})
    });

    return v.parse(MaintenanceNotificationResultSchema, {
      notified: true,
      notifyChannel: "qqbot",
      notifyError: null
    });
  } catch (error) {
    const message = redactConfiguredToken(
      error instanceof Error ? error.message : "notification failed",
      env.QQBOT_TOKEN
    );
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

function parseQqBotUid(value: string | undefined): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("QQBOT_UID is required");
  }

  const uid = Number(value);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new Error("QQBOT_UID must be a positive integer");
  }

  return uid;
}

function redactConfiguredToken(message: string, token: string | undefined): string {
  if (typeof token !== "string") return message;

  const tokenValues = [token, token.trim()].filter(
    (value, index, values) => value.length > 0 && values.indexOf(value) === index
  );
  return tokenValues.reduce(
    (redactedMessage, tokenValue) => redactedMessage.split(tokenValue).join("[redacted]"),
    message
  );
}
