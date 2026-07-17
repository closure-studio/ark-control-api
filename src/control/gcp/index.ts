import type { Env } from "../../env";
import {
  createAccount,
  deleteAccount,
  listAccounts,
  upsertAccountByProjectId,
  updateAccount,
  type CreateGcpAccountInput,
  type UpdateGcpAccountInput
} from "../../gcp/worker/services/gcp/accounts";
import { GcpError } from "../../gcp/worker/services/gcp/errors";

function accountInput(body: Record<string, unknown>): CreateGcpAccountInput {
  return {
    name: typeof body.name === "string" ? body.name : "",
    projectId: typeof body.projectId === "string" ? body.projectId : "",
    serviceAccountEmail: typeof body.serviceAccountEmail === "string" ? body.serviceAccountEmail : "",
    workloadIdentityProvider:
      typeof body.workloadIdentityProvider === "string" ? body.workloadIdentityProvider : "",
    defaultZone: typeof body.defaultZone === "string" ? body.defaultZone : ""
  };
}

function accountPatch(body: Record<string, unknown>): UpdateGcpAccountInput {
  return {
    name: typeof body.name === "string" ? body.name : undefined,
    projectId: typeof body.projectId === "string" ? body.projectId : undefined,
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

export async function listGcpAccounts(env: Env) {
  return listAccounts(env);
}

export async function createGcpAccount(env: Env, body: Record<string, unknown>) {
  return createAccount(env, accountInput(body));
}

export async function updateGcpAccount(env: Env, accountId: number, body: Record<string, unknown>) {
  return updateAccount(env, accountId, accountPatch(body));
}

export async function deleteGcpAccount(env: Env, accountId: number): Promise<void> {
  await deleteAccount(env, accountId);
}

export async function registerMachineGcpAccount(env: Env, body: Record<string, unknown>) {
  const input = accountInput(body);
  const name =
    typeof body.name === "string"
      ? body.name
      : typeof body.id === "string"
        ? body.id
        : input.projectId;
  return upsertAccountByProjectId(env, { ...input, name });
}

export function toGcpControlError(error: unknown): { message: string; status: number } | null {
  return error instanceof GcpError ? { message: error.message, status: error.status } : null;
}
