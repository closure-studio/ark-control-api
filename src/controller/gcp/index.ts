import { API_ERROR_CODES, type ApiErrorCode } from "../../constants/api/error-codes";
import type { Env } from "../../schemas/env";
import type {
  CreateGcpAccountRequest,
  RegisterGcpAccountRequest,
  UpdateGcpAccountRequest
} from "../../schemas/gcp/accounts";
import {
  createAccount,
  deleteAccount,
  listAccounts,
  upsertAccountByProjectId,
  updateAccount
} from "../../services/gcp/accounts";
import { countOperations, listOperations } from "../../services/gcp/operations";
import type { GcpOperationsResponse } from "../../schemas/gcp/responses";
import { GcpError } from "../../errors/gcp";

export async function listGcpAccounts(env: Env) {
  return listAccounts(env);
}

export async function listGcpOperations(
  env: Env,
  limit: number,
  offset: number
): Promise<GcpOperationsResponse> {
  const [operations, total] = await Promise.all([
    listOperations(env, limit, offset),
    countOperations(env)
  ]);
  return {
    operations,
    pagination: { limit, offset, count: operations.length, total }
  };
}

export async function createGcpAccount(env: Env, body: CreateGcpAccountRequest) {
  return createAccount(env, body);
}

export async function updateGcpAccount(
  env: Env,
  accountId: number,
  body: UpdateGcpAccountRequest
) {
  return updateAccount(env, accountId, body);
}

export async function deleteGcpAccount(env: Env, accountId: number): Promise<void> {
  await deleteAccount(env, accountId);
}

export async function registerMachineGcpAccount(env: Env, body: RegisterGcpAccountRequest) {
  return upsertAccountByProjectId(env, body);
}

export function toGcpControlError(
  error: unknown
): { code: ApiErrorCode; message: string; status: number } | null {
  if (!(error instanceof GcpError)) return null;
  const code =
    error.status === 404
      ? API_ERROR_CODES.NOT_FOUND
      : error.status >= 500
        ? API_ERROR_CODES.GCP_SERVICE_ERROR
        : API_ERROR_CODES.BAD_REQUEST;
  return { code, message: error.message, status: error.status };
}
