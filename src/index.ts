import { createRouter } from "./router";
import { oidcRouter, shouldHandleOidcRequest } from "./router/oidc";
import type { Env } from "./schemas/env";
import { runMaintenanceMonitor } from "./services/maintenance/monitor";
import { runPipelineForEnv } from "./services/watcher/pipeline";
import { runRetentionCleanup } from "./services/retention";

export const api = createRouter();

export type ScheduledTask = "watcher" | "maintenance" | "retention";

export function scheduledTaskForCron(cron: string): ScheduledTask | null {
  if (cron === "*/10 * * * *") return "watcher";
  if (cron === "17 * * * *") return "maintenance";
  if (cron === "15 3 * * *") return "retention";
  return null;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (shouldHandleOidcRequest(request, env)) {
      return await oidcRouter.fetch(request, env, ctx);
    }
    return await api.fetch(request, env, ctx);
  },

  scheduled(event, env, ctx): void {
    const task = scheduledTaskForCron(event.cron);
    if (task === null) {
      console.warn("Unknown scheduled cron expression", { cron: event.cron });
      return;
    }

    if (task === "retention") {
      ctx.waitUntil(runRetentionCleanup(env));
      return;
    }
    if (task === "maintenance") {
      ctx.waitUntil(runMaintenanceMonitor(env));
      return;
    }
    ctx.waitUntil(runPipelineForEnv(env));
  }
} satisfies ExportedHandler<Env>;
