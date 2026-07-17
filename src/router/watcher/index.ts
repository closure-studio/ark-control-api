import { Hono } from "hono";
import {
  getRunLog,
  listReleaseRuns,
  listReleaseSummaries
} from "../../control/watcher";
import type { Env } from "../../env";
import { jsonError, parseId } from "../../utils/http";

function parsePaginationValue(value: string | undefined, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export function createWatcherRouter() {
  const router = new Hono<{ Bindings: Env }>();

  router.get("/releases", async (c) => {
    c.header("cache-control", "no-store");
    const limit = Math.min(parsePaginationValue(c.req.query("limit"), 50), 100);
    const offset = parsePaginationValue(c.req.query("offset"), 0);
    return c.json(await listReleaseSummaries(c.env, limit, offset));
  });
  router.get("/releases/:id/runs", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return jsonError(c, "not_found", "Release was not found.", 404);
    c.header("cache-control", "no-store");
    const result = await listReleaseRuns(c.env, id);
    return result ? c.json(result) : c.json({ error: "not_found" }, 404);
  });
  router.get("/runs/:id/log", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return jsonError(c, "not_found", "Run was not found.", 404);
    c.header("cache-control", "no-store");
    const result = await getRunLog(c.env, id);
    return result ? c.json(result) : c.json({ error: "not_found" }, 404);
  });

  return router;
}
