import type { MiddlewareHandler } from "hono";
import type { WorkerHonoEnv } from "../model/schema/worker";
import { errorBody } from "../utils/http";

function readBearerToken(value: string | null): string | null {
  if (!value?.startsWith("Bearer ")) {
    return null;
  }
  const token = value.slice("Bearer ".length).trim();
  return token ? token : null;
}

export const requireAdmin: MiddlewareHandler<WorkerHonoEnv> = async (c, next) => {
  const configuredToken = c.env.ADMIN_TOKEN?.trim();
  if (!configuredToken) {
    return c.json(errorBody("ADMIN_TOKEN is not configured."), 500);
  }

  const requestToken = readBearerToken(c.req.header("Authorization") ?? null);
  if (requestToken !== configuredToken) {
    return c.json(errorBody("Unauthorized."), 401);
  }

  await next();
};
