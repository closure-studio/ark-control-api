import * as v from "valibot";

import {
  MAINTENANCE_DEFAULT_USER_AGENT,
  MAINTENANCE_NEWS_API_URL,
  MAINTENANCE_NEWS_DETAIL_BASE_URL,
  MAINTENANCE_NEWS_LIMIT,
  MAINTENANCE_REQUEST_TIMEOUT_MS
} from "../../constants/maintenance/config";
import {
  MaintenanceNewsListResponseSchema,
  NewsLinkSchema,
  type MaintenanceNewsListResponse,
  type NewsDetail,
  type NewsLink
} from "../../schemas/maintenance/announcements";
import { parseNewsDetail } from "../../utils/maintenance/news-html";

type NewsRequestOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
};

export async function fetchMaintenanceNewsLinks(
  options: NewsRequestOptions = {}
): Promise<NewsLink[]> {
  const links: NewsLink[] = [];
  const seen = new Set<string>();
  let reachedEnd = false;

  for (
    let page = 1;
    page <= MAINTENANCE_NEWS_LIMIT && links.length < MAINTENANCE_NEWS_LIMIT;
    page += 1
  ) {
    const response = await fetchMaintenanceNewsPage(page, options);
    const countBeforePage = links.length;

    for (const item of response.data.list) {
      if (seen.has(item.cid)) continue;
      seen.add(item.cid);
      links.push(
        v.parse(NewsLinkSchema, {
          id: item.cid,
          url: `${MAINTENANCE_NEWS_DETAIL_BASE_URL}/${item.cid}`
        })
      );
    }

    if (response.data.end) {
      reachedEnd = true;
      break;
    }
    if (links.length === countBeforePage) {
      throw new Error(`Maintenance news API page ${page} did not contain any new announcements`);
    }
  }

  if (links.length === 0) {
    throw new Error("Maintenance news API returned no announcements");
  }
  if (links.length < MAINTENANCE_NEWS_LIMIT && !reachedEnd) {
    throw new Error(`Maintenance news API pagination exceeded ${MAINTENANCE_NEWS_LIMIT} pages`);
  }

  return links.slice(0, MAINTENANCE_NEWS_LIMIT);
}

export async function fetchMaintenanceNewsDetail(
  link: NewsLink,
  options: NewsRequestOptions = {}
): Promise<NewsDetail> {
  const html = await fetchMaintenanceText(link.url, options);
  return parseNewsDetail(link.id, link.url, html);
}

async function fetchMaintenanceText(url: string, options: NewsRequestOptions): Promise<string> {
  return fetchMaintenanceResource(
    url,
    options,
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    (response) => response.text()
  );
}

async function fetchMaintenanceNewsPage(
  page: number,
  options: NewsRequestOptions
): Promise<MaintenanceNewsListResponse> {
  const url = new URL(MAINTENANCE_NEWS_API_URL);
  url.searchParams.set("category", "LATEST");
  url.searchParams.set("page", String(page));
  const json = await fetchMaintenanceResource<unknown>(
    url.toString(),
    options,
    "application/json",
    (response) => response.json().catch(() => undefined)
  );
  const result = v.safeParse(MaintenanceNewsListResponseSchema, json);
  if (!result.success) {
    throw new Error(`Maintenance news API page ${page} returned an invalid response`);
  }
  return result.output;
}

async function fetchMaintenanceResource<T>(
  url: string,
  options: NewsRequestOptions,
  accept: string,
  read: (response: Response) => Promise<T>
): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? MAINTENANCE_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": options.userAgent ?? MAINTENANCE_DEFAULT_USER_AGENT,
        Accept: accept
      }
    });
    if (!response.ok) {
      throw new Error(`Maintenance news request failed with status ${response.status}`);
    }
    return await read(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Maintenance news request timed out after ${timeoutMs}ms`);
    }
    throw error instanceof Error ? error : new Error("Maintenance news request failed");
  } finally {
    clearTimeout(timeout);
  }
}
