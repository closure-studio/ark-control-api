import { Hono } from "hono";
import { getHealthData } from "../../controller/health";
import type { Env } from "../../types/env";

export function createHealthRouter() {
  const router = new Hono<{ Bindings: Env }>();
  router.get("/health", (c) => c.json(getHealthData()));
  return router;
}
