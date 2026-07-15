import { listHosts } from "../controllers/hostController";
import { listReleaseRuns, listReleaseSummaries } from "../controllers/releaseController";
import { getRunLog } from "../controllers/runController";
import { getStatus } from "../controllers/statusController";
import type { Env } from "../types";
import { isAuthorized, jsonResponse, unauthorizedResponse } from "../utils/http";

function notFound(): Response {
  return jsonResponse({ error: "not_found" }, { status: 404 });
}

function toRouteId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  return Number.parseInt(value, 10);
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (!pathname.startsWith("/api/watcher/")) {
    return notFound();
  }

  if (!isAuthorized(request, env.ADMIN_TOKEN)) {
    return unauthorizedResponse();
  }

  if (request.method === "GET" && pathname === "/api/watcher/status") {
    return await getStatus(env);
  }

  if (request.method === "GET" && pathname === "/api/watcher/releases") {
    return await listReleaseSummaries(request, env);
  }

  if (request.method === "GET" && pathname === "/api/watcher/hosts") {
    return await listHosts(env);
  }

  const releaseRunsMatch = pathname.match(/^\/api\/watcher\/releases\/(\d+)\/runs$/);
  if (request.method === "GET" && releaseRunsMatch) {
    const releaseId = toRouteId(releaseRunsMatch[1]);
    return releaseId === null ? notFound() : await listReleaseRuns(env, releaseId);
  }

  const runLogMatch = pathname.match(/^\/api\/watcher\/runs\/(\d+)\/log$/);
  if (request.method === "GET" && runLogMatch) {
    const runId = toRouteId(runLogMatch[1]);
    return runId === null ? notFound() : await getRunLog(env, runId);
  }

  return notFound();
}
