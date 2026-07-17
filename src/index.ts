import { Hono } from "hono";
import type { Env } from "./env";
import { createApiRouter } from "./router";
import { oidcRouter, shouldHandleOidcRequest } from "./router/oidc";
import { runPipelineForEnv } from "./watcher/services/pipelineService";
import { runRetentionCleanup } from "./retention";

export const api = new Hono<{ Bindings: Env }>();

api.get("/health", (c) => c.json({ ok: true, service: "ark-control-api", time: new Date().toISOString() }));
api.route("/", createApiRouter());
api.notFound((c) => c.json({ error: "not_found" }, 404));

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (shouldHandleOidcRequest(request, env)) {
      return await oidcRouter.fetch(request, env, ctx);
    }
    return await api.fetch(request, env, ctx);
  },

  scheduled(event, env, ctx): void {
    ctx.waitUntil(event.cron === "15 3 * * *" ? runRetentionCleanup(env) : runPipelineForEnv(env));
  }
} satisfies ExportedHandler<Env>;
