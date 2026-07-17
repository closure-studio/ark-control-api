import { Hono } from "hono";
import type { Env } from "../env";
import { ControlApiError } from "../types/control/errors";
import { jsonError } from "../utils/http";
import { createDashboardRouter } from "./dashboard";
import { createGcpRouter } from "./gcp";
import { createPyHelperRouter } from "./pyhelper";
import { createVpsRouter } from "./vps";
import { createWatcherRouter } from "./watcher";

export function createApiRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.use("/api/*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (path.startsWith("/api/pyhelper/assets/")) {
      await next();
      return;
    }
    if (!c.env.ADMIN_TOKEN || c.req.header("authorization") !== `Bearer ${c.env.ADMIN_TOKEN}`) {
      return jsonError(c, "unauthorized", "Unauthorized", 401);
    }
    await next();
  });

  app.route("/api", createDashboardRouter());
  app.route("/api", createGcpRouter());
  app.route("/api", createVpsRouter());
  app.route("/api", createWatcherRouter());
  app.route("/api", createPyHelperRouter());

  app.all("/api/*", (c) => jsonError(c, "not_found", "API route was not found.", 404));
  app.onError((error, c) => {
    if (error instanceof ControlApiError) {
      return jsonError(c, error.code, error.message, error.status, error.details);
    }
    if (error instanceof Error && "status" in error && typeof error.status === "number") {
      return jsonError(c, "request_failed", error.message, error.status);
    }
    console.error("Unexpected control API error", error);
    return jsonError(c, "internal_error", "Internal server error.", 500);
  });

  return app;
}
