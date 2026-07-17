import { listAccounts } from "../../gcp/worker/services/gcp/accounts";
import { listRecentOperations } from "../../gcp/worker/services/gcp/operations";
import type { Env } from "../../env";
import { countNonTerminalHostRuns, countRunsByReleaseIds, hasNonTerminalHostRuns } from "../../watcher/models/hostRunModel";
import { getLatestReleaseApkFilename, listReleases } from "../../watcher/models/releaseModel";
import type { DashboardResponse } from "../../types/dashboard";
import { listVpsResources } from "../vps";

export async function getDashboardData(env: Env): Promise<DashboardResponse> {
  const [accounts, inventory, releases, recentOperations, lastProcessedApkFilename, hasNonTerminal, nonTerminalCount] =
    await Promise.all([
      listAccounts(env),
      listVpsResources(env),
      listReleases(env.DB, 5, 0),
      listRecentOperations(env, 10),
      getLatestReleaseApkFilename(env.DB),
      hasNonTerminalHostRuns(env.DB),
      countNonTerminalHostRuns(env.DB)
    ]);
  const statusCounts = await countRunsByReleaseIds(
    env.DB,
    releases.map((release) => release.id)
  );
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      accounts: {
        total: accounts.length,
        enabled: accounts.filter((account) => account.enabled).length
      },
      vps: {
        total: inventory.vps.length,
        watcherEnabled: inventory.vps.filter((item) => item.watcherEnabled).length
      },
      watcher: {
        lastProcessedApkFilename,
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
    recentOperations
  };
}
