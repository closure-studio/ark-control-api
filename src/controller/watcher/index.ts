import type { WatcherDeploymentRow as HostRunRow } from "../../db/schema";
import type { Env } from "../../schemas/env";
import { countRunsByReleaseIds, getHostRun, listRunsForRelease } from "../../repositories/watcher/host-runs";
import { getRelease, listReleases, type ReleaseRow } from "../../repositories/watcher/releases";

type ReleaseListItem = {
  id: number;
  apkFilename: string;
  finalUrl: string;
  createdAt: string;
  statusCounts: Record<string, number>;
};

type ReleaseRun = {
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

function toReleaseListItem(release: ReleaseRow, statusCounts: Record<string, number>): ReleaseListItem {
  return {
    id: release.id,
    apkFilename: release.apk_filename,
    finalUrl: release.final_url,
    createdAt: release.detected_at,
    statusCounts
  };
}

function toReleaseRun(run: HostRunRow): ReleaseRun {
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

export async function listReleaseSummaries(env: Env, limit: number, offset: number) {
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

export async function listReleaseRuns(env: Env, releaseId: number) {
  if (!(await getRelease(env.DB, releaseId))) return null;
  const runs = await listRunsForRelease(env.DB, releaseId);
  return { runs: runs.map(toReleaseRun) };
}

export async function getRunLog(env: Env, runId: number) {
  const run = await getHostRun(env.DB, runId);
  if (!run) return null;
  return {
    lastLogTail: run.last_log_tail,
    lastCheckedAt: run.last_checked_at,
    updatedAt: run.updated_at
  };
}
