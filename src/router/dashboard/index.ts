import { Hono } from "hono";
import { getDashboardData } from "../../controller/dashboard";
import type { Env } from "../../schemas/env";
import { jsonData } from "../../utils/http";

export function createDashboardRouter() {
  const router = new Hono<{ Bindings: Env }>();
  router.get("/dashboard", async (c) => jsonData(c, await getDashboardData(c.env)));
  return router;
}
