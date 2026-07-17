import { Hono } from "hono";
import { getDashboardData } from "../../control/dashboard";
import type { Env } from "../../env";

export function createDashboardRouter() {
  const router = new Hono<{ Bindings: Env }>();
  router.get("/dashboard", async (c) => c.json(await getDashboardData(c.env)));
  return router;
}
