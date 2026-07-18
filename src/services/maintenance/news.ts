import {
  MAINTENANCE_DEFAULT_USER_AGENT,
  MAINTENANCE_NEWS_LIMIT,
  MAINTENANCE_NEWS_URL,
  MAINTENANCE_REQUEST_TIMEOUT_MS
} from "../../constants/maintenance/config";
import type {
  NewsDetail,
  NewsLink
} from "../../schemas/maintenance/announcements";
import {
  extractNewsLinks,
  parseNewsDetail
} from "../../utils/maintenance/news-html";

type NewsRequestOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
};

export async function fetchMaintenanceNewsLinks(
  options: NewsRequestOptions = {}
): Promise<NewsLink[]> {
  const html = await fetchMaintenanceText(MAINTENANCE_NEWS_URL, options);
  return extractNewsLinks(html, MAINTENANCE_NEWS_URL).slice(0, MAINTENANCE_NEWS_LIMIT);
}

export async function fetchMaintenanceNewsDetail(
  link: NewsLink,
  options: NewsRequestOptions = {}
): Promise<NewsDetail> {
  const html = await fetchMaintenanceText(link.url, options);
  return parseNewsDetail(link.id, link.url, html);
}

async function fetchMaintenanceText(url: string, options: NewsRequestOptions): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? MAINTENANCE_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": options.userAgent ?? MAINTENANCE_DEFAULT_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    if (!response.ok) {
      throw new Error(`Maintenance news request failed with status ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Maintenance news request timed out after ${timeoutMs}ms`);
    }
    throw error instanceof Error ? error : new Error("Maintenance news request failed");
  } finally {
    clearTimeout(timeout);
  }
}
