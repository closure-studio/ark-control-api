import { Hono } from "hono";
import { API_ERRORS } from "../shared/constants/errors";
import { ROUTES } from "../shared/constants/routes";
import { isBearerAuthorized } from "./auth/tokens";
import type { Env } from "./env";
import { jsonError } from "./http/errors";
import { createAdminVpsHostsRoutes } from "./routes/admin-vps-hosts";

export function createVpsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.use("/api/vps/*", async (c, next) => {
    if (!c.env.ADMIN_TOKEN) return jsonError(API_ERRORS.unauthorized, 401);
    if (!isBearerAuthorized(c.req.raw, c.env.ADMIN_TOKEN)) return jsonError(API_ERRORS.unauthorized, 401);
    await next();
  });

  const adminVpsHostsRoutes = createAdminVpsHostsRoutes();

  app.route(ROUTES.admin.vpsHosts, adminVpsHostsRoutes);
  app.route(`${ROUTES.admin.vpsHosts}/`, adminVpsHostsRoutes);

  app.onError(() => jsonError(API_ERRORS.internalError, 500));
  return app;
}

export default createVpsRouter();
