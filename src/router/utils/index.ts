import { Hono } from "hono";
import { getHealthData } from "../../controller/utils";
import type { Env } from "../../env";

export function createUtilsRouter() {
  const router = new Hono<{ Bindings: Env }>();
  router.get("/health", (c) => c.json(getHealthData()));
  return router;
}
