import { countNonTerminalHostRuns, hasNonTerminalHostRuns } from "../models/hostRunModel";
import { getLatestReleaseApkFilename } from "../models/releaseModel";
import type { Env } from "../types";
import { jsonResponse } from "../utils/http";

export async function getStatus(env: Env): Promise<Response> {
  const [lastProcessedApkFilename, hasNonTerminal, nonTerminalCount] = await Promise.all([
    getLatestReleaseApkFilename(env.DB),
    hasNonTerminalHostRuns(env.DB),
    countNonTerminalHostRuns(env.DB),
  ]);

  return jsonResponse({
    lastProcessedApkFilename,
    hasNonTerminalHostRuns: hasNonTerminal,
    nonTerminalHostRunCount: nonTerminalCount,
  });
}
