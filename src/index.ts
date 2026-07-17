import { createRouter } from "./router";
import { oidcRouter, shouldHandleOidcRequest } from "./router/oidc";
import type { Env } from "./env";
import { runPipelineForEnv } from "./watcher/services/pipelineService";
import { runRetentionCleanup } from "./retention";

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
