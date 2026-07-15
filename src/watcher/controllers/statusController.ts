import { countNonTerminalHostRuns, hasNonTerminalHostRuns } from "../models/hostRunModel";
import { getLastSuccessfulCheckAt, getLatestReleaseCheck } from "../models/releaseCheckModel";
import { getLatestReleaseApkFilename } from "../models/releaseModel";
import type { Env } from "../types";
import { jsonResponse } from "../utils/http";

export async function getStatus(env: Env): Promise<Response> {
  const [lastProcessedApkFilename, latestCheck, lastSuccessfulCheckAt, hasNonTerminal, nonTerminalCount] = await Promise.all([
    getLatestReleaseApkFilename(env.DB),
    getLatestReleaseCheck(env.DB),
    getLastSuccessfulCheckAt(env.DB),
    hasNonTerminalHostRuns(env.DB),
    countNonTerminalHostRuns(env.DB),
  ]);

  return jsonResponse({
    lastProcessedApkFilename,
    lastSuccessfulCheckAt,
    lastCheckError: latestCheck?.outcome === "failed" ? latestCheck.error_message : null,
    hasNonTerminalHostRuns: hasNonTerminal,
    nonTerminalHostRunCount: nonTerminalCount,
  });
}
