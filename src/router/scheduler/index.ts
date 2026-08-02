import { Hono } from "hono";

import { ensureSchedulerAlarms } from "../../controller/scheduler";
import type { Env } from "../../schemas/env";
import { jsonData } from "../../utils/http";

export function createSchedulerRouter() {
  const router = new Hono<{ Bindings: Env }>();

  router.post("/scheduler/ensure", async (c) => jsonData(c, await ensureSchedulerAlarms(c.env)));

  return router;
}
