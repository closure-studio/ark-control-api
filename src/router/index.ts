import { Hono } from "hono";
import { API_ERROR_CODES } from "../constants/api/error-codes";
import type { Env } from "../schemas/env";
import { ControlApiError } from "../errors/control-api";
import { jsonError } from "../utils/http";
import { createGcpRouter } from "./gcp";
import { createPyHelperRouter } from "./pyhelper";
import { createHealthRouter } from "./health";
import { createVpsRouter } from "./vps";
import { createWatcherRouter } from "./watcher";

export function createRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.route("/", createHealthRouter());

  app.use("/api/*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (path.startsWith("/api/pyhelper/assets/")) {
      await next();
      return;
    }
    if (!c.env.ADMIN_TOKEN || c.req.header("authorization") !== `Bearer ${c.env.ADMIN_TOKEN}`) {
      return jsonError(c, API_ERROR_CODES.UNAUTHORIZED, "Unauthorized", 401);
    }
    await next();
  });

  app.route("/api", createGcpRouter());
  app.route("/api", createVpsRouter());
  app.route("/api", createWatcherRouter());
  app.route("/api", createPyHelperRouter());

  app.all("/api/*", (c) =>
    jsonError(c, API_ERROR_CODES.NOT_FOUND, "API route was not found.", 404)
  );
  app.onError((error, c) => {
    if (error instanceof ControlApiError) {
      return jsonError(c, error.code, error.message, error.status, error.details);
    }
    if (error instanceof Error && "status" in error && typeof error.status === "number") {
      return jsonError(c, API_ERROR_CODES.REQUEST_FAILED, error.message, error.status);
    }
    console.error("Unexpected control API error", error);
    return jsonError(c, API_ERROR_CODES.INTERNAL_ERROR, "Internal server error.", 500);
  });
  app.notFound((c) => c.json({ error: API_ERROR_CODES.NOT_FOUND }, 404));

  return app;
}
