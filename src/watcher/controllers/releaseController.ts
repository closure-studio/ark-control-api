import { countRunsByReleaseIds, listRunsForRelease } from "../models/hostRunModel";
import { getRelease, listReleases, type ReleaseRow } from "../models/releaseModel";
import type { Env, HostRunRow } from "../types";
import { jsonResponse } from "../utils/http";

type ReleaseListItem = {
  id: number;
  apkFilename: string;
  finalUrl: string;
  createdAt: string;
  statusCounts: Record<string, number>;
};

type ReleaseRunApiRow = {
  id: number;
  releaseId: number;
  hostId: number | null;
  hostName: string;
  hostIp: string;
  status: HostRunRow["status"];
  startedAt: string | null;
  nextCheckAt: string | null;
  deadlineAt: string | null;
  lastCheckedAt: string | null;
  lastAiStatus: HostRunRow["last_ai_status"];
  lastAiReason: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

function parsePaginationValue(value: string | null, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function parseLimit(value: string | null): number {
  return Math.min(parsePaginationValue(value, 50), 100);
}

function parseOffset(value: string | null): number {
  return parsePaginationValue(value, 0);
}

function toReleaseListItem(release: ReleaseRow, statusCounts: Record<string, number>): ReleaseListItem {
  return {
    id: release.id,
    apkFilename: release.apk_filename,
    finalUrl: release.final_url,
    createdAt: release.detected_at,
    statusCounts,
  };
}

function toReleaseRunApiRow(run: HostRunRow): ReleaseRunApiRow {
  return {
    id: run.id,
    releaseId: run.release_id,
    hostId: run.host_id,
    hostName: run.host_name_snapshot,
    hostIp: run.host_address_snapshot,
    status: run.status,
    startedAt: run.started_at,
    nextCheckAt: run.next_check_at,
    deadlineAt: run.deadline_at,
    lastCheckedAt: run.last_checked_at,
    lastAiStatus: run.last_ai_status,
    lastAiReason: run.last_ai_reason,
    errorMessage: run.error_message,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  };
}

export async function listReleaseSummaries(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const offset = parseOffset(url.searchParams.get("offset"));
  const releases = await listReleases(env.DB, limit, offset);
  const statusCountsByReleaseId = await countRunsByReleaseIds(
    env.DB,
    releases.map((release) => release.id),
  );
  const items: ReleaseListItem[] = releases.map((release) =>
    toReleaseListItem(release, statusCountsByReleaseId[release.id] ?? {}),
  );

  return jsonResponse({
    releases: items,
    pagination: {
      limit,
      offset,
      count: items.length,
    },
  });
}

export async function listReleaseRuns(env: Env, releaseId: number): Promise<Response> {
  const release = await getRelease(env.DB, releaseId);
  if (!release) {
    return jsonResponse({ error: "not_found" }, { status: 404 });
  }

  const runs = await listRunsForRelease(env.DB, releaseId);
  return jsonResponse({
    runs: runs.map(toReleaseRunApiRow),
  });
}
