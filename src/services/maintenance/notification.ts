import * as v from "valibot";

import { MAINTENANCE_REQUEST_TIMEOUT_MS } from "../../constants/maintenance/config";
import type { Env } from "../../schemas/env";
import {
  MaintenanceNotificationResultSchema,
  type ClassificationResult,
  type MaintenanceNotificationResult,
  type NewsDetail
} from "../../schemas/maintenance/announcements";
import type { MaintenancePreActionNotification } from "../../schemas/maintenance/pre-action-notifications";
import { sendQqBotAutoMessage } from "../notifications/qq-bot";

const PRE_ACTION_FAILURE_LABELS = {
  schedule: "调度时间无效",
  auth: "ArkHost Passport 登录失败",
  config: "关闭游戏登录失败",
  host_inventory: "没有可用的 ArkHost",
  ssh: "ArkHost SSH 重启失败",
  missed: "已错过维护前置时间",
  interrupted: "维护前置动作被中断"
} as const;

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

export async function notifyMaintenancePreAction(
  env: Env,
  event: MaintenancePreActionNotification,
  fetcher?: typeof fetch
): Promise<void> {
  await sendQqBotAutoMessage(env, buildMaintenancePreActionMessage(event), {
    timeoutMs: MAINTENANCE_REQUEST_TIMEOUT_MS,
    ...(fetcher !== undefined ? { fetcher } : {})
  });
}

export function buildMaintenancePreActionMessage(event: MaintenancePreActionNotification): string {
  const context = [
    `公告：${event.title ?? event.newsId}`,
    `维护开始：${event.maintenanceStart ?? "未提供"}`,
    `目标主机：${event.hostNames.length === 0 ? "无" : event.hostNames.join("、")}`
  ];

  if (event.type === "pre_action_started") {
    return ["⏳ ArkHost 维护前置动作开始", "", ...context, "操作：关闭游戏登录并重启 ArkHost"].join(
      "\n"
    );
  }

  if (event.outcome === "completed") {
    return [
      "✅ ArkHost 维护前置动作完成",
      "",
      ...context,
      "结果：游戏登录已关闭，全部目标主机重启成功"
    ].join("\n");
  }

  const failure =
    event.failureStep === null ? "未知失败" : PRE_ACTION_FAILURE_LABELS[event.failureStep];
  return [
    "❌ ArkHost 维护前置动作失败",
    "",
    ...context,
    `失败步骤：${failure}`,
    `错误：${event.errorMessage ?? "未提供"}`
  ].join("\n");
}
