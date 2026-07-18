import * as v from "valibot";

import {
  ClassificationResultSchema,
  MaintenanceTimeSchema,
  type ClassificationResult,
  type MaintenanceTime,
  type NewsDetail
} from "../../schemas/maintenance/announcements";

const EXCLUSION_KEYWORDS = ["活动公告", "寻访公告", "时装", "组合包", "礼包", "通讯", "限时活动"];

export function classifyByRules(
  news: Pick<NewsDetail, "title" | "content">
): ClassificationResult {
  const maintenanceTime = extractMaintenanceTime(news.content);

  if (news.title.includes("版本更新停机维护") || news.title.includes("停机维护")) {
    return maintenanceResult("标题包含停机维护关键词", news.title, news.content, maintenanceTime);
  }

  if (news.content.includes("维护时间") && news.content.includes("无法登录")) {
    return maintenanceResult("正文包含维护时间和无法登录", news.title, news.content, maintenanceTime);
  }

  if (news.content.includes("停机维护") && news.content.includes("维护期间")) {
    return maintenanceResult("正文包含停机维护和维护期间", news.title, news.content, maintenanceTime);
  }

  const exclusion = EXCLUSION_KEYWORDS.find(
    (keyword) => news.title.includes(keyword) || news.content.includes(keyword)
  );
  if (exclusion) {
    return v.parse(ClassificationResultSchema, {
      status: "not_maintenance",
      isMaintenance: false,
      reason: `命中普通公告排除词：${exclusion}`,
      summary: summarize(news.title, news.content),
      maintenanceStart: null,
      maintenanceEnd: null
    });
  }

  return v.parse(ClassificationResultSchema, {
    status: "uncertain",
    isMaintenance: false,
    reason: "规则无法确定公告类型",
    summary: summarize(news.title, news.content),
    maintenanceStart: null,
    maintenanceEnd: null
  });
}

export function extractMaintenanceTime(content: string): MaintenanceTime {
  const normalized = content.replace(/\s+/g, " ").trim();
  const labeled = /维护时间[:：]\s*([^。；;\n]+?)(?:更新说明|维护补偿|开服时间|$)/.exec(normalized);
  const source = labeled?.[1]?.trim() || normalized;

  const fullDate = /(\d{4}年\s*\d{1,2}月\s*\d{1,2}日\s*\d{1,2}:\d{2})\s*(?:~|-|至|—|－)\s*(\d{1,2}:\d{2})/.exec(source);
  if (fullDate?.[1] && fullDate[2]) {
    return v.parse(MaintenanceTimeSchema, {
      start: compactChineseTime(fullDate[1]),
      end: fullDate[2],
      raw: fullDate[0].trim()
    });
  }

  const monthDate = /(\d{1,2}月\s*\d{1,2}日\s*\d{1,2}:\d{2})\s*(?:~|-|至|—|－)\s*(\d{1,2}:\d{2})/.exec(source);
  if (monthDate?.[1] && monthDate[2]) {
    return v.parse(MaintenanceTimeSchema, {
      start: compactChineseTime(monthDate[1]),
      end: monthDate[2],
      raw: monthDate[0].trim()
    });
  }

  if (labeled?.[1]) {
    return v.parse(MaintenanceTimeSchema, {
      start: labeled[1].trim(),
      end: null,
      raw: labeled[1].trim()
    });
  }

  return v.parse(MaintenanceTimeSchema, { start: null, end: null, raw: null });
}

function maintenanceResult(
  reason: string,
  title: string,
  content: string,
  time: MaintenanceTime
): ClassificationResult {
  return v.parse(ClassificationResultSchema, {
    status: "maintenance",
    isMaintenance: true,
    reason,
    summary: summarize(title, content),
    maintenanceStart: time.start,
    maintenanceEnd: time.end
  });
}

function summarize(title: string, content: string): string {
  const text = content || title;
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function compactChineseTime(value: string): string {
  return value.replace(/\s+/g, "");
}
