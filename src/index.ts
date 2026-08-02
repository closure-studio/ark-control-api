import { createRouter } from "./router";
import { oidcRouter, shouldHandleOidcRequest } from "./router/oidc";
import type { Env } from "./schemas/env";
import { ensureControlJobAlarms } from "./services/scheduler/client";

export { ControlJobAlarm } from "./services/scheduler/control-job-alarm";

export const api = createRouter();

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (shouldHandleOidcRequest(request, env)) {
      return await oidcRouter.fetch(request, env, ctx);
    }
    return await api.fetch(request, env, ctx);
  },

  scheduled(_event, env, ctx): void {
    ctx.waitUntil(ensureControlJobAlarms(env.CONTROL_JOB_ALARMS));
  }
} satisfies ExportedHandler<Env>;
