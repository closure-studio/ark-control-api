import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { API_ERROR_CODES } from "../../constants/api/error-codes";
import { MAX_FAILURE_REQUEST_BYTES } from "../../constants/arkhook/config";
import { getFailure, listFailures, uploadTaskFailure } from "../../controller/arkhook";
import {
  TaskFailureListQuerySchema,
  TaskFailureParamSchema,
  TaskFailureUploadSchema
} from "../../schemas/arkhook/requests";
import type { Env } from "../../schemas/env";
import { jsonData, jsonError, validationErrorHook } from "../../utils/http";

export function createArkhookRouter() {
  const router = new Hono<{ Bindings: Env }>();
  router.use("/arkhook/*", async (c, next) => {
    c.header("cache-control", "no-store");
    return next();
  });
  router.post(
    "/arkhook/task-failures",
    bodyLimit({
      maxSize: MAX_FAILURE_REQUEST_BYTES,
      onError: (c) =>
        jsonError(c, API_ERROR_CODES.PAYLOAD_TOO_LARGE, "Request exceeds 8,500,000 bytes.", 413)
    }),
    sValidator("json", TaskFailureUploadSchema, validationErrorHook),
    async (c) => jsonData(c, await uploadTaskFailure(c.env.DB, c.req.valid("json")))
  );
  router.get(
    "/arkhook/task-failures",
    sValidator("query", TaskFailureListQuerySchema, validationErrorHook),
    async (c) => jsonData(c, await listFailures(c.env.DB, c.req.valid("query")))
  );
  router.get(
    "/arkhook/task-failures/:task_id",
    sValidator("param", TaskFailureParamSchema, validationErrorHook),
    async (c) => {
      const record = await getFailure(c.env.DB, c.req.valid("param").task_id);
      return record
        ? jsonData(c, record)
        : jsonError(c, API_ERROR_CODES.NOT_FOUND, "Task failure was not found.", 404);
    }
  );
  return router;
}
