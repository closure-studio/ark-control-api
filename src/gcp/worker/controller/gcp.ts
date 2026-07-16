import type { Context } from "hono";
import type { GcpInstance, GcpInstancesActionRequest, GcpPartialError } from "../../shared/api";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { WorkerHonoEnv } from "../model/schema/worker";
import {
  createAccount,
  deleteAccount,
  listAccounts,
  listEnabledAccountRows,
  upsertAccountByProjectId,
  updateAccount
} from "../services/gcp/accounts";
import { fetchGoogleAccessToken } from "../services/gcp/auth";
import { listProjectInstances } from "../services/gcp/compute";
import { GcpError } from "../services/gcp/errors";
import { createDefaultVps, submitBatchInstanceAction } from "../services/gcp/operations";
import { errorBody, readJsonObject } from "../utils/http";

function accountId(c: Context<WorkerHonoEnv>): number | null {
  const id = Number(c.req.param("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function gcpErrorResponse(c: Context<WorkerHonoEnv>, error: unknown) {
  if (error instanceof GcpError) {
    return c.json(errorBody(error.message), error.status as ContentfulStatusCode);
  }
  throw error;
}

export async function getGcpAccounts(c: Context<WorkerHonoEnv>) {
  return c.json({ accounts: await listAccounts(c.env) });
}

export async function postGcpAccount(c: Context<WorkerHonoEnv>) {
  try {
    const body = await readJsonObject(c.req.raw);
    const account = await createAccount(c.env, {
      name: typeof body?.name === "string" ? body.name : "",
      projectId: typeof body?.projectId === "string" ? body.projectId : "",
      serviceAccountEmail:
        typeof body?.serviceAccountEmail === "string" ? body.serviceAccountEmail : "",
      workloadIdentityProvider:
        typeof body?.workloadIdentityProvider === "string" ? body.workloadIdentityProvider : "",
      defaultZone: typeof body?.defaultZone === "string" ? body.defaultZone : ""
    });
    return c.json({ account }, 201);
  } catch (error) {
    return gcpErrorResponse(c, error);
  }
}

export async function postPublicGcpAccount(c: Context<WorkerHonoEnv>) {
  try {
    const body = await readJsonObject(c.req.raw);
    const projectId = typeof body?.projectId === "string" ? body.projectId : "";
    const name =
      typeof body?.name === "string"
        ? body.name
        : typeof body?.id === "string"
          ? body.id
          : projectId;
    const result = await upsertAccountByProjectId(c.env, {
      name,
      projectId,
      serviceAccountEmail:
        typeof body?.serviceAccountEmail === "string" ? body.serviceAccountEmail : "",
      workloadIdentityProvider:
        typeof body?.workloadIdentityProvider === "string" ? body.workloadIdentityProvider : "",
      defaultZone: typeof body?.defaultZone === "string" ? body.defaultZone : ""
    });
    return c.json({ account: result.account }, result.created ? 201 : 200);
  } catch (error) {
    return gcpErrorResponse(c, error);
  }
}

export async function patchGcpAccount(c: Context<WorkerHonoEnv>) {
  try {
    const id = accountId(c);
    if (!id) {
      return c.json(errorBody("Invalid account id."), 400);
    }
    const body = await readJsonObject(c.req.raw);
    const account = await updateAccount(c.env, id, {
      name: typeof body?.name === "string" ? body.name : undefined,
      projectId: typeof body?.projectId === "string" ? body.projectId : undefined,
      serviceAccountEmail:
        typeof body?.serviceAccountEmail === "string" ? body.serviceAccountEmail : undefined,
      workloadIdentityProvider:
        typeof body?.workloadIdentityProvider === "string"
          ? body.workloadIdentityProvider
          : undefined,
      defaultZone: typeof body?.defaultZone === "string" ? body.defaultZone : undefined,
      enabled: typeof body?.enabled === "boolean" ? body.enabled : undefined
    });
    return c.json({ account });
  } catch (error) {
    return gcpErrorResponse(c, error);
  }
}

export async function deleteGcpAccount(c: Context<WorkerHonoEnv>) {
  try {
    const id = accountId(c);
    if (!id) {
      return c.json(errorBody("Invalid account id."), 400);
    }
    await deleteAccount(c.env, id);
    return c.json({ ok: true });
  } catch (error) {
    return gcpErrorResponse(c, error);
  }
}

export async function getGcpInstances(c: Context<WorkerHonoEnv>) {
  const accountFilter = c.req.query("accountId");
  const projectFilter = c.req.query("projectId");
  const statusFilter = c.req.query("status");
  const instances: GcpInstance[] = [];
  const errors: GcpPartialError[] = [];

  for (const account of await listEnabledAccountRows(c.env)) {
    if (accountFilter && String(account.id) !== accountFilter) {
      continue;
    }
    try {
      const token = await fetchGoogleAccessToken(c.env, account);
      if (projectFilter && account.project_id !== projectFilter) {
        continue;
      }
      try {
        const projectInstances = await listProjectInstances({
          fetcher: fetch,
          accessToken: token,
          accountId: account.id,
          accountName: account.name,
          projectId: account.project_id
        });
        instances.push(
          ...projectInstances.filter((instance) =>
            statusFilter ? instance.status === statusFilter : true
          )
        );
      } catch (error) {
        errors.push({
          scope: "project",
          accountId: account.id,
          projectId: account.project_id,
          message: error instanceof Error ? error.message : "Unable to list project instances."
        });
      }
    } catch (error) {
      errors.push({
        scope: "account",
        accountId: account.id,
        message: error instanceof Error ? error.message : "Unable to access GCP account."
      });
    }
  }

  return c.json({ instances, errors });
}

export async function postGcpAccountInstance(c: Context<WorkerHonoEnv>) {
  try {
    const id = accountId(c);
    if (!id) {
      return c.json(errorBody("Invalid account id."), 400);
    }
    const result = await createDefaultVps(c.env, id, { workerBaseUrl: new URL(c.req.url).origin });
    return c.json({ result }, result.status === "succeeded" ? 201 : 502);
  } catch (error) {
    return gcpErrorResponse(c, error);
  }
}

export async function postGcpInstanceActions(c: Context<WorkerHonoEnv>) {
  try {
    const body = (await readJsonObject(c.req.raw)) as Partial<GcpInstancesActionRequest> | null;
    if (body?.action !== "start" && body?.action !== "stop" && body?.action !== "delete") {
      return c.json(errorBody("Instance action must be start, stop, or delete."), 400);
    }
    if (!Array.isArray(body.instances) || body.instances.length === 0) {
      return c.json(errorBody("At least one instance is required."), 400);
    }
    const results = await submitBatchInstanceAction(c.env, body.action, body.instances);
    return c.json({ results });
  } catch (error) {
    return gcpErrorResponse(c, error);
  }
}
