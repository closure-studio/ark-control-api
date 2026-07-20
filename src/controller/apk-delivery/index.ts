import type { Env } from "../../schemas/env";
import type {
  ReleaseListItem,
  ReleaseListResponse,
  ReleaseRun,
  ReleaseRunsResponse,
  RunListResponse,
  RunLogResponse
} from "../../schemas/apk-delivery/responses";
import type {
  ArknightsApkHostRunRow,
  ArknightsApkReleaseRow
} from "../../db/schema";
import {
  countHostRuns,
  countRunsByReleaseIds,
  getHostRun,
  listHostRuns as listHostRunRows,
  listRunsForRelease
} from "../../repositories/apk-delivery/host-runs";
import { getRelease, listReleases } from "../../repositories/apk-delivery/releases";
import { NON_TERMINAL_HOST_RUN_STATUSES, TERMINAL_HOST_RUN_STATUSES } from "../../constants/apk-delivery/status";
import type { HostRunListQuery } from "../../schemas/apk-delivery/requests";
import type { HostRunStatus } from "../../schemas/apk-delivery/status";

function toReleaseListItem(
  release: ArknightsApkReleaseRow,
  statusCounts: Record<string, number>
): ReleaseListItem {
  return {
    id: release.id,
    apkFilename: release.apk_filename,
    finalUrl: release.final_url,
    createdAt: release.detected_at,
    statusCounts
  };
}

function toReleaseRun(run: ArknightsApkHostRunRow): ReleaseRun {
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
    updatedAt: run.updated_at
  };
}

function statusesForState(state: HostRunListQuery["state"]): readonly HostRunStatus[] | undefined {
  if (state === "active") return NON_TERMINAL_HOST_RUN_STATUSES;
  if (state === "terminal") return TERMINAL_HOST_RUN_STATUSES;
  return undefined;
}

export async function listHostRuns(
  env: Env,
  query: HostRunListQuery
): Promise<RunListResponse> {
  const statuses = statusesForState(query.state);
  const [rows, total] = await Promise.all([
    listHostRunRows(env.DB, statuses, query.limit, query.offset),
    countHostRuns(env.DB, statuses)
  ]);
  const runs = rows.map(toReleaseRun);
  return {
    runs,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      count: runs.length,
      total
    }
  };
}

export async function listReleaseSummaries(
  env: Env,
  limit: number,
  offset: number
): Promise<ReleaseListResponse> {
  const releases = await listReleases(env.DB, limit, offset);
  const statusCounts = await countRunsByReleaseIds(
    env.DB,
    releases.map((release) => release.id)
  );
  const items = releases.map((release) =>
    toReleaseListItem(release, statusCounts[release.id] ?? {})
  );
  return { releases: items, pagination: { limit, offset, count: items.length } };
}

export async function listReleaseRuns(
  env: Env,
  releaseId: number
): Promise<ReleaseRunsResponse | null> {
  if (!(await getRelease(env.DB, releaseId))) return null;
  const runs = await listRunsForRelease(env.DB, releaseId);
  return { runs: runs.map(toReleaseRun) };
}

export async function getRunLog(env: Env, runId: number): Promise<RunLogResponse | null> {
  const run = await getHostRun(env.DB, runId);
  if (!run) return null;
  return {
    lastLogTail: run.last_log_tail,
    lastCheckedAt: run.last_checked_at,
    updatedAt: run.updated_at
  };
}
