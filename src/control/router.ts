import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { deleteAccount, createAccount, listAccounts, loadAccountRow, updateAccount } from "../gcp/worker/services/gcp/accounts";
import { postPublicGcpAccount } from "../gcp/worker/controller/gcp";
import { getPyHelperAsset } from "../gcp/worker/controller/pyhelper";
import type { Env } from "../env";
import { listReleaseRuns, listReleaseSummaries } from "../watcher/controllers/releaseController";
import { getRunLog } from "../watcher/controllers/runController";
import { executeHostCommand } from "../vps/worker/services/host-command-executor";
import { validateCreateVpsHost, validatePatchVpsHost } from "../vps/worker/validation/vps-hosts";
import { VpsHostRepository } from "../vps/worker/repositories/vps-hosts";
import { ControlApiError } from "./errors";
import { getDashboardData } from "./services/dashboard";
import {
  cascadeDeleteAccountVps,
  createManualVps,
  deleteVps,
  getVpsResource,
  isProjectIdentityChange,
  listVpsResources,
  provisionGcpVps,
  reconcileVpsCloudLinks,
  runBatchVpsAction,
  runVpsAction,
  updateVps
} from "./services/vps";

type ControlContext = Context<{ Bindings: Env }>;

function jsonError(c: ControlContext, error: string, message: string, status: number, details?: unknown) {
  return c.json(
    details === undefined ? { error, message } : { error, message, details },
    status as ContentfulStatusCode
  );
}

function parseId(value: string): number | null {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

async function readBody(c: ControlContext): Promise<Record<string, unknown>> {
  const value = await c.req.json().catch(() => null);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ControlApiError("bad_request", "Request body must be an object.", 400);
  }
  return value as Record<string, unknown>;
}

function accountInput(body: Record<string, unknown>) {
  return {
    name: typeof body.name === "string" ? body.name : "",
    projectId: typeof body.projectId === "string" ? body.projectId : "",
    projectNumber: typeof body.projectNumber === "string" ? body.projectNumber : "",
    serviceAccountEmail: typeof body.serviceAccountEmail === "string" ? body.serviceAccountEmail : "",
    workloadIdentityProvider:
      typeof body.workloadIdentityProvider === "string" ? body.workloadIdentityProvider : "",
    defaultZone: typeof body.defaultZone === "string" ? body.defaultZone : ""
  };
}

function accountPatch(body: Record<string, unknown>) {
  return {
    name: typeof body.name === "string" ? body.name : undefined,
    projectId: typeof body.projectId === "string" ? body.projectId : undefined,
    projectNumber: typeof body.projectNumber === "string" ? body.projectNumber : undefined,
    serviceAccountEmail:
      typeof body.serviceAccountEmail === "string" ? body.serviceAccountEmail : undefined,
    workloadIdentityProvider:
      typeof body.workloadIdentityProvider === "string"
        ? body.workloadIdentityProvider
        : undefined,
    defaultZone: typeof body.defaultZone === "string" ? body.defaultZone : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined
  };
}

export function createControlRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.use("/api/*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (path === "/api/public/accounts" || path.startsWith("/api/pyhelper/assets/")) {
      await next();
      return;
    }
    if (!c.env.ADMIN_TOKEN || c.req.header("authorization") !== `Bearer ${c.env.ADMIN_TOKEN}`) {
      return jsonError(c, "unauthorized", "Unauthorized", 401);
    }
    await next();
  });

  app.post("/api/public/accounts", postPublicGcpAccount);
  app.get("/api/pyhelper/assets/:assetName", getPyHelperAsset);

  app.get("/api/dashboard", async (c) => c.json(await getDashboardData(c.env)));

  app.get("/api/accounts", async (c) => c.json({ accounts: await listAccounts(c.env) }));
  app.post("/api/accounts", async (c) => {
    const account = await createAccount(c.env, accountInput(await readBody(c)));
    return c.json({ account }, 201);
  });
  app.patch("/api/accounts/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError("bad_request", "Invalid account id.", 400);
    const body = accountPatch(await readBody(c));
    const current = await loadAccountRow(c.env, id);
    if (isProjectIdentityChange(current, body)) {
      const linked = await new VpsHostRepository(c.env.DB).listByGcpAccountId(id);
      if (linked.length > 0) {
        throw new ControlApiError(
          "account_has_vps",
          "Project identity cannot change while the account has linked VPS records.",
          409,
          { vpsCount: linked.length }
        );
      }
    }
    return c.json({ account: await updateAccount(c.env, id, body) });
  });
  app.delete("/api/accounts/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError("bad_request", "Invalid account id.", 400);
    await loadAccountRow(c.env, id);
    const result = await cascadeDeleteAccountVps(c.env, id);
    if (result.failed.length > 0) {
      throw new ControlApiError(
        "cascade_incomplete",
        "Some VPS records could not be deleted. The account was retained.",
        409,
        result
      );
    }
    await deleteAccount(c.env, id);
    return c.json({ deleted: true, vps: result.deleted });
  });
  app.post("/api/accounts/:id/vps", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError("bad_request", "Invalid account id.", 400);
    const result = await provisionGcpVps(c.env, id, new URL(c.req.url).origin);
    return c.json(result, 201);
  });

  app.get("/api/vps", async (c) => c.json(await listVpsResources(c.env)));
  app.post("/api/vps", async (c) => {
    const body = await readBody(c);
    if (body.watcherEnabled !== undefined && typeof body.watcherEnabled !== "boolean") {
      throw new ControlApiError("bad_request", "watcherEnabled must be a boolean.", 400);
    }
    const validation = validateCreateVpsHost({
      name: body.name,
      address: body.address,
      port: body.port,
      username: body.username,
      password: body.password,
      verify_command: body.verifyCommand
    });
    if (!validation.ok) throw new ControlApiError("bad_request", validation.message, 400);
    let vps = await createManualVps(c.env, validation.value);
    if (body.watcherEnabled === false) {
      vps = await updateVps(c.env, vps.id, { enabled: false });
    }
    return c.json({ vps }, 201);
  });
  app.get("/api/vps/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError("bad_request", "Invalid VPS id.", 400);
    return c.json({ vps: await getVpsResource(c.env, id) });
  });
  app.patch("/api/vps/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError("bad_request", "Invalid VPS id.", 400);
    const body = await readBody(c);
    const validation = validatePatchVpsHost({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.address !== undefined ? { address: body.address } : {}),
      ...(body.port !== undefined ? { port: body.port } : {}),
      ...(body.username !== undefined ? { username: body.username } : {}),
      ...(body.password !== undefined ? { password: body.password } : {}),
      ...(body.verifyCommand !== undefined ? { verify_command: body.verifyCommand } : {}),
      ...(body.watcherEnabled !== undefined ? { enabled: body.watcherEnabled } : {})
    });
    if (!validation.ok) throw new ControlApiError("bad_request", validation.message, 400);
    return c.json({ vps: await updateVps(c.env, id, validation.value) });
  });
  app.delete("/api/vps/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError("bad_request", "Invalid VPS id.", 400);
    return c.json(await deleteVps(c.env, id));
  });
  app.post("/api/vps/:id/verify", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError("bad_request", "Invalid VPS id.", 400);
    return c.json({ result: await executeHostCommand(c.env, { hostId: id }) });
  });
  app.post("/api/vps/:id/actions", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError("bad_request", "Invalid VPS id.", 400);
    const { action } = await readBody(c);
    if (action !== "start" && action !== "stop") {
      throw new ControlApiError("bad_request", "Action must be start or stop.", 400);
    }
    return c.json({ result: await runVpsAction(c.env, id, action) });
  });
  app.post("/api/vps/actions", async (c) => {
    const { action, ids } = await readBody(c);
    if (action !== "start" && action !== "stop" && action !== "delete") {
      throw new ControlApiError("bad_request", "Action must be start, stop, or delete.", 400);
    }
    if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id) && Number(id) > 0)) {
      throw new ControlApiError("bad_request", "ids must be an array of positive integers.", 400);
    }
    return c.json(await runBatchVpsAction(c.env, ids as number[], action));
  });
  app.post("/api/vps/reconcile", async (c) => c.json(await reconcileVpsCloudLinks(c.env)));

  app.get("/api/releases", (c) => listReleaseSummaries(c.req.raw, c.env));
  app.get("/api/releases/:id/runs", (c) => {
    const id = parseId(c.req.param("id"));
    return id ? listReleaseRuns(c.env, id) : jsonError(c, "not_found", "Release was not found.", 404);
  });
  app.get("/api/runs/:id/log", (c) => {
    const id = parseId(c.req.param("id"));
    return id ? getRunLog(c.env, id) : jsonError(c, "not_found", "Run was not found.", 404);
  });

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
