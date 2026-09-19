import { fetchMaintenanceNewsLinks } from "../maintenance/news";
import {
  listAnnouncements,
  projectAnnouncement,
  readCollection,
  saveAnnouncement,
  saveCollection
} from "../../repositories/public-announcements";
import { announcementHtml } from "../../utils/public-announcements/html";
import { parseAnnouncement } from "../../utils/public-announcements/parser";
import { nextUtcHour } from "../scheduler/time";
import type { AnnouncementErrorCode } from "../../schemas/public-announcements/snapshot";

const MAX_BYTES = 1024 * 1024;
type Options = { fetcher?: typeof fetch; now?: Date; timeoutMs?: number };

export async function collectPublicAnnouncements(
  db: D1Database,
  options: Options = {}
): Promise<Date> {
  const now = options.now ?? new Date();
  const nowText = now.toISOString();
  const previous = await readCollection(db);
  if (previous?.retry_at && Date.parse(previous.retry_at) > now.getTime())
    return new Date(previous.retry_at);
  let retryAt: Date | null = null;
  let errorCode: AnnouncementErrorCode = null;
  let successes = 0;
  let failed = false;
  let next = nextUtcHour(now);
  await saveCollection(db, {
    source_id: "official-cn",
    last_attempt_at: nowText,
    last_success_at: previous?.last_success_at ?? null,
    status: "failed",
    error_code: "source_failed",
    retry_at: null
  });

  const boundedFetch: typeof fetch = async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const response = await (options.fetcher ?? fetch)(input, {
        ...init,
        redirect: "error",
        signal: controller.signal
      });
      if (response.status === 429) {
        const header = response.headers.get("Retry-After") ?? "";
        const delay = /^\d+$/.test(header)
          ? now.getTime() + Number(header) * 1000
          : Date.parse(header);
        retryAt = new Date(
          Number.isFinite(delay) && delay > now.getTime() && delay < 8.64e15
            ? delay
            : next.getTime()
        );
        errorCode = "rate_limited";
        await response.body?.cancel();
        throw new Error("rate limited");
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("source HTTP failure");
      }
      if (Number(response.headers.get("Content-Length")) > MAX_BYTES) {
        await response.body?.cancel();
        throw new Error("response too large");
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > MAX_BYTES) {
              await reader.cancel();
              throw new Error("response too large");
            }
            chunks.push(part.value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new Response(bytes, { headers: response.headers });
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const links = await fetchMaintenanceNewsLinks({ fetcher: boundedFetch, allowEmpty: true });
    const saved = await listAnnouncements(db, now);
    const active = saved.filter((row) =>
      projectAnnouncement(row).windows.some((w) => !w.endAt || Date.parse(w.endAt) > now.getTime())
    );
    const candidates = [
      ...new Map(
        [...links, ...active.map((row) => ({ id: row.news_id, url: row.source_url }))].map(
          (link) => [link.id, link]
        )
      ).values()
    ];
    if (links.length >= 10 || candidates.length > 20 || saved.length > 100)
      errorCode = "limit_reached";
    for (const link of candidates.slice(0, 20)) {
      try {
        const response = await boundedFetch(link.url);
        const article = announcementHtml(await response.text());
        const hashBytes = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(article))
        );
        const hash = Array.from(new Uint8Array(hashBytes), (b) =>
          b.toString(16).padStart(2, "0")
        ).join("");
        const old = saved.find((row) => row.news_id === link.id);
        const windows =
          old?.content_hash === hash
            ? projectAnnouncement(old).windows
            : parseAnnouncement(article.title, article.lines, article.publishedAt);
        if (windows.some((w) => w.parseStatus === "pending")) errorCode ??= "parse_pending";
        await saveAnnouncement(db, {
          news_id: link.id,
          source_url: link.url,
          title: article.title,
          published_at: article.publishedAt,
          content_hash: hash,
          windows_json: JSON.stringify(windows),
          fetched_at: nowText,
          recheck_at: nowText
        });
        successes++;
      } catch {
        failed = true;
        errorCode ??= "source_failed";
        if (retryAt) break;
      }
    }
  } catch {
    failed = true;
    errorCode ??= "source_failed";
  }
  if (retryAt) next = new Date(Math.max(next.getTime(), new Date(retryAt).getTime()));
  await saveCollection(db, {
    source_id: "official-cn",
    last_attempt_at: nowText,
    last_success_at:
      !failed && (!errorCode || errorCode === "parse_pending")
        ? nowText
        : (previous?.last_success_at ?? null),
    status: failed && successes === 0 ? "failed" : errorCode ? "partial" : "ready",
    error_code: errorCode,
    retry_at: retryAt ? next.toISOString() : null
  });
  return next;
}

export async function nextPublicAnnouncementAlarm(db: D1Database, now: Date): Promise<Date> {
  const state = await readCollection(db);
  return new Date(
    Math.max(nextUtcHour(now).getTime(), state?.retry_at ? Date.parse(state.retry_at) : 0)
  );
}
