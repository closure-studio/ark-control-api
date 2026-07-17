import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { API_ERROR_CODES } from "../../constants/api/error-codes";
import {
  getRunLog,
  listReleaseRuns,
  listReleaseSummaries
} from "../../controller/watcher";
import { IdParamSchema, PaginationQuerySchema } from "../../schemas/http";
import type { Env } from "../../types/env";
import { jsonData, jsonError, validationErrorHook } from "../../utils/http";

export function createWatcherRouter() {
  const router = new Hono<{ Bindings: Env }>();

  router.get(
    "/releases",
    sValidator("query", PaginationQuerySchema, validationErrorHook),
    async (c) => {
      c.header("cache-control", "no-store");
      const { limit = 50, offset = 0 } = c.req.valid("query");
      return jsonData(c, await listReleaseSummaries(c.env, limit, offset));
    }
  );
  router.get(
    "/releases/:id/runs",
    sValidator("param", IdParamSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      c.header("cache-control", "no-store");
      const result = await listReleaseRuns(c.env, id);
      return result
        ? jsonData(c, result)
        : jsonError(c, API_ERROR_CODES.NOT_FOUND, "Release was not found.", 404);
    }
  );
  router.get(
    "/runs/:id/log",
    sValidator("param", IdParamSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      c.header("cache-control", "no-store");
      const result = await getRunLog(c.env, id);
      return result
        ? jsonData(c, result)
        : jsonError(c, API_ERROR_CODES.NOT_FOUND, "Run was not found.", 404);
    }
  );

  return router;
}
