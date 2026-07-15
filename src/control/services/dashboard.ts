import { listAccounts } from "../../gcp/worker/services/gcp/accounts";
import { listRecentOperations } from "../../gcp/worker/services/gcp/operations";
import type { Env } from "../../env";
import { countNonTerminalHostRuns, countRunsByReleaseIds, hasNonTerminalHostRuns } from "../../watcher/models/hostRunModel";
import { getLatestReleaseApkFilename, listReleases } from "../../watcher/models/releaseModel";
import { getLastSuccessfulCheckAt, getLatestReleaseCheck } from "../../watcher/models/releaseCheckModel";
import type { DashboardResponse } from "../types";
import { listVpsResources } from "./vps";

export async function getDashboardData(env: Env): Promise<DashboardResponse> {
  const [accounts, inventory, releases, recentOperations, latestCheck, lastSuccessfulCheckAt, lastProcessedApkFilename, hasNonTerminal, nonTerminalCount] =
    await Promise.all([
      listAccounts(env),
      listVpsResources(env),
      listReleases(env.DB, 5, 0),
      listRecentOperations(env, 10),
      getLatestReleaseCheck(env.DB),
      getLastSuccessfulCheckAt(env.DB),
      getLatestReleaseApkFilename(env.DB),
      hasNonTerminalHostRuns(env.DB),
      countNonTerminalHostRuns(env.DB)
    ]);
  const statusCounts = await countRunsByReleaseIds(
    env.DB,
    releases.map((release) => release.id)
  );
  const gcp = inventory.vps.filter((item) => item.source === "gcp");
  const running = gcp.filter((item) => item.cloud?.status === "RUNNING").length;
  const stopped = gcp.filter((item) =>
    ["TERMINATED", "SUSPENDED"].includes(item.cloud?.status ?? "")
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      accounts: {
        total: accounts.length,
        enabled: accounts.filter((account) => account.enabled).length
      },
      vps: {
        total: inventory.vps.length,
        gcp: gcp.length,
        manual: inventory.vps.length - gcp.length,
        running,
        stopped,
        unavailable: gcp.length - running - stopped,
        watcherEnabled: inventory.vps.filter((item) => item.watcherEnabled).length
      },
      watcher: {
        lastProcessedApkFilename,
        lastSuccessfulCheckAt,
        lastCheckError: latestCheck?.outcome === "failed" ? latestCheck.error_message : null,
        hasNonTerminalHostRuns: hasNonTerminal,
        nonTerminalHostRunCount: nonTerminalCount
      }
    },
    recentReleases: releases.map((release) => ({
      id: release.id,
      apkFilename: release.apk_filename,
      finalUrl: release.final_url,
      createdAt: release.detected_at,
      statusCounts: statusCounts[release.id] ?? {}
    })),
    recentOperations,
    errors: inventory.errors
  };
}
