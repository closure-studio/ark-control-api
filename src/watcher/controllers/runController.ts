import { getHostRun } from "../models/hostRunModel";
import type { Env } from "../types";
import { jsonResponse } from "../utils/http";

export async function getRunLog(env: Env, runId: number): Promise<Response> {
  const run = await getHostRun(env.DB, runId);
  if (!run) {
    return jsonResponse({ error: "not_found" }, { status: 404 });
  }

  return jsonResponse({
    lastLogTail: run.last_log_tail,
    lastCheckedAt: run.last_checked_at,
    updatedAt: run.updated_at,
  });
}
