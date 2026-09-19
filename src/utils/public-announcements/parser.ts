import type { AnnouncementWindow } from "../../schemas/public-announcements/snapshot";

function kindFor(text: string): AnnouncementWindow["kind"] {
  if (/停机|停服/.test(text)) return "downtime";
  if (text.includes("闪断")) return "brief_disconnect";
  if (/商店|兑换/.test(text)) return "shop";
  if (/领取|领奖|奖励/.test(text)) return "reward";
  if (/售卖|礼包|组合包|时装/.test(text)) return "sale";
  if (/关卡|作战/.test(text)) return "stage";
  if (text.includes("活动")) return "activity";
  return "other";
}

function dateParts(text: string, fallback?: number[]): number[] | null {
  const full = /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(\d{1,2})[:：](\d{2})/.exec(text);
  if (full)
    return [
      Number(full[1] ?? fallback?.[0]),
      Number(full[2]),
      Number(full[3]),
      Number(full[4]),
      Number(full[5])
    ];
  const time = /^\s*(\d{1,2})[:：](\d{2})/.exec(text);
  return time && fallback ? [...fallback.slice(0, 3), Number(time[1]), Number(time[2])] : null;
}

function timestamp(parts: number[] | null): string | null {
  if (!parts) return null;
  const [year = NaN, month = NaN, day = NaN, hour = NaN, minute = NaN] = parts;
  if (year < 2000 || year > 9999 || hour > 23 || minute > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+08:00`;
}

export function parseAnnouncement(
  title: string,
  lines: string[],
  publishedAt: string | null
): AnnouncementWindow[] {
  const windows: AnnouncementWindow[] = [];
  let section = title;
  const titleKind = kindFor(title);
  const maintenance = titleKind === "downtime" || titleKind === "brief_disconnect";
  const correction = /取消|延期|勘误/.test(title + lines.join(" "));
  for (const line of lines) {
    if (windows.length >= 100) break;
    if (!line.trim()) continue;
    if (!/\d{1,2}[:：]\d{2}/.test(line)) {
      if (line.length <= 300) section = line;
      if (/时间|日期|另行通知|待定/.test(line))
        windows.push({
          kind: maintenance ? titleKind : kindFor(section),
          sectionLabel: section.slice(0, 300),
          startAt: null,
          endAt: null,
          timezone: "Asia/Shanghai",
          rawTimeText: line.slice(0, 2000),
          parseStatus: "pending"
        });
      continue;
    }
    const label = line.split(/[:：]/)[0] ?? section;
    const kind = maintenance
      ? titleKind
      : kindFor(label) === "other"
        ? kindFor(section)
        : kindFor(label);
    const validPublication =
      publishedAt &&
      /^\d{4}-\d{2}-\d{2}$/.test(publishedAt) &&
      timestamp([...publishedAt.split("-").map(Number), 0, 0]);
    const year = validPublication && publishedAt ? Number(publishedAt.slice(0, 4)) : NaN;
    const first = dateParts(line, [year]);
    const tail = line.split(/至|[~～—]/)[1];
    const last = tail ? dateParts(tail, first ?? undefined) : null;
    const publicationMonth = publishedAt ? Number(publishedAt.slice(5, 7)) : NaN;
    const missingYearFarFromPublication =
      !/\d{4}年/.test(line) && first && Math.abs((first[1] ?? NaN) - publicationMonth) > 6;
    const unresolved =
      correction || missingYearFarFromPublication || /取消|延期|勘误|另行通知/.test(line);
    let startAt = unresolved ? null : timestamp(first);
    let endAt = unresolved ? null : timestamp(last);
    // Missing years may only inherit within the publication year, never roll over implicitly.
    if (startAt && endAt && endAt < startAt) {
      startAt = null;
      endAt = null;
    }
    windows.push({
      kind,
      sectionLabel: (kindFor(label) !== "other" ? label : section).slice(0, 300),
      startAt,
      endAt,
      timezone: "Asia/Shanghai",
      rawTimeText: line.slice(0, 2000),
      parseStatus: startAt && endAt ? "parsed" : "pending"
    });
    if (windows.length === 100) break;
  }
  if (
    !windows.length &&
    /维护|闪断|活动|关卡|商店|兑换|领取|礼包|限时|时间|日期|延期|取消/.test(title + lines.join(" "))
  )
    windows.push({
      kind: titleKind,
      sectionLabel: title.slice(0, 300),
      startAt: null,
      endAt: null,
      timezone: "Asia/Shanghai",
      rawTimeText: lines.join(" ").slice(0, 2000),
      parseStatus: "pending"
    });
  return windows;
}
