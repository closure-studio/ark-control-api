import { createRouter } from "./router";
import { oidcRouter, shouldHandleOidcRequest } from "./router/oidc";
import type { Env } from "./schemas/env";
import { runPipelineForEnv } from "./services/watcher/pipeline";
import { runRetentionCleanup } from "./services/retention";

export const api = createRouter();

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
