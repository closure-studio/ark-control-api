import { Hono } from "hono";
import {
  deleteGcpAccount,
  getGcpAccounts,
  getGcpInstances,
  patchGcpAccount,
  postGcpAccount,
  postGcpAccountInstance,
  postGcpInstanceActions,
  postPublicGcpAccount
} from "../controller/gcp";
import { getPyHelperAsset } from "../controller/pyhelper";
import { requireAdmin } from "../middleware/admin";
import { handleUnexpectedError } from "../middleware/error";
import type { Env, WorkerHonoEnv } from "../model/schema/worker";
import { errorBody } from "../utils/http";

export function createWorkerRouter() {
  const app = new Hono<WorkerHonoEnv>();

  app.onError(handleUnexpectedError);

  app.get("/api/pyhelper/assets/:assetName", getPyHelperAsset);
  app.post("/api/gcp/public/accounts", postPublicGcpAccount);
  app.use("/api/gcp/*", requireAdmin);
  app.get("/api/gcp/accounts", getGcpAccounts);
  app.post("/api/gcp/accounts", postGcpAccount);
  app.patch("/api/gcp/accounts/:id", patchGcpAccount);
  app.delete("/api/gcp/accounts/:id", deleteGcpAccount);
  app.post("/api/gcp/accounts/:id/instances", postGcpAccountInstance);
  app.get("/api/gcp/instances", getGcpInstances);
  app.post("/api/gcp/instances/actions", postGcpInstanceActions);
  return app;
}

const app = createWorkerRouter();

export async function routeRequest(request: Request, env: Env): Promise<Response> {
  return app.fetch(request, env);
}
