import { fetchMaintenanceNewsLinks } from "../maintenance/news";
import { readSnapshot, saveSnapshot } from "../../repositories/public-announcements";
import { announcementHtml } from "../../utils/public-announcements/html";
import { parseAnnouncement } from "../../utils/public-announcements/parser";
import { summarizePendingWindows } from "./ai";
import type { Env } from "../../schemas/env";
import type { Announcement } from "../../schemas/public-announcements/snapshot";

const MAX_BYTES = 1024 * 1024;
type Options = {
  fetcher?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
  ai?: Pick<Env, "AI" | "AI_MODEL">;
  aiTimeoutMs?: number;
};

export async function collectPublicAnnouncements(
  db: D1Database,
  options: Options = {}
): Promise<Date> {
  const now = options.now ?? new Date();
  const nowText = now.toISOString();
  const next = nextPublicAnnouncementAlarm(now);

  const boundedFetch: typeof fetch = async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const response = await (options.fetcher ?? fetch)(input, {
        ...init,
        redirect: "error",
        signal: controller.signal
      });
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
    const saved = await readSnapshot(db);
    const active = (saved?.events ?? []).filter((event) =>
      event.windows.some(
        (window) =>
          window.parseStatus === "pending" ||
          !window.endAt ||
          Date.parse(window.endAt) > now.getTime()
      )
    );
    const candidates = [
      ...new Map(
        [...active.map((event) => ({ id: event.newsId, url: event.sourceUrl })), ...links].map(
          (link) => [link.id, link]
        )
      ).values()
    ];
    if (candidates.length > 20) throw new Error("announcement detail limit reached");
    const events: Announcement[] = [];
    let bytes = 0;
    for (const link of candidates) {
      const response = await boundedFetch(link.url);
      const article = announcementHtml(await response.text());
      if (!article.title || !article.lines.length) throw new Error("empty announcement article");
      let windows = parseAnnouncement(article.title, article.lines, article.publishedAt);
      if (options.ai && windows.some((window) => window.parseStatus === "pending")) {
        windows = await summarizePendingWindows(
          options.ai,
          article.title,
          windows,
          options.aiTimeoutMs
        );
      }
      if (
        !windows.length ||
        windows.every(
          (window) =>
            window.parseStatus === "parsed" &&
            window.endAt &&
            Date.parse(window.endAt) <= now.getTime()
        )
      )
        continue;
      const event = {
        newsId: link.id,
        sourceUrl: link.url,
        title: article.title,
        publishedAt: article.publishedAt,
        fetchedAt: nowText,
        windows
      };
      bytes += new TextEncoder().encode(JSON.stringify(event)).byteLength + 1;
      if (bytes > 900_000) throw new Error("announcement snapshot limit reached");
      events.push(event);
    }
    await saveSnapshot(db, events, now);
  } catch {
    // One failed detail invalidates this collection; keep the last complete snapshot.
    console.warn("Public announcement collection failed; previous snapshot retained");
  }
  return next;
}

export function nextPublicAnnouncementAlarm(now: Date): Date {
  const period = 12 * 60 * 60 * 1000;
  return new Date((Math.floor(now.getTime() / period) + 1) * period);
}
