import type { GcpAccount } from "../../../shared/api";
import type { GcpAccountRow } from "../../model/schema/gcp";
import { toGcpAccount } from "../../model/schema/gcp";
import type { Env } from "../../model/schema/worker";
import { GcpError } from "./errors";

const ACCOUNT_COLUMNS =
  "id, name, project_id, project_number, service_account_email, workload_identity_provider, default_zone, enabled, created_at, updated_at";

export type CreateGcpAccountInput = {
  name: string;
  projectId: string;
  projectNumber: string;
  serviceAccountEmail: string;
  workloadIdentityProvider: string;
  defaultZone: string;
};

export type UpdateGcpAccountInput = Partial<CreateGcpAccountInput> & {
  enabled?: boolean;
};

export type UpsertGcpAccountResult = {
  account: GcpAccount;
  created: boolean;
};

export async function listAccountRows(env: Env): Promise<GcpAccountRow[]> {
  const result = await env.DB.prepare(
    `SELECT ${ACCOUNT_COLUMNS} FROM gcp_accounts ORDER BY id DESC`
  ).all<GcpAccountRow>();
  return result.results;
}

export async function listAccounts(env: Env): Promise<GcpAccount[]> {
  return (await listAccountRows(env)).map(toGcpAccount);
}

export async function createAccount(
  env: Env,
  input: CreateGcpAccountInput
): Promise<GcpAccount> {
  const name = input.name.trim();
  if (!name) {
    throw new GcpError("Account name is required.");
  }

  const projectId = input.projectId.trim();
  const projectNumber = input.projectNumber.trim();
  const serviceAccountEmail = input.serviceAccountEmail.trim();
  const workloadIdentityProvider = input.workloadIdentityProvider.trim();
  const defaultZone = input.defaultZone.trim();

  if (!projectId) {
    throw new GcpError("Project id is required.");
  }
  if (!projectNumber) {
    throw new GcpError("Project number is required.");
  }
  if (!serviceAccountEmail) {
    throw new GcpError("Service account email is required.");
  }
  if (!workloadIdentityProvider) {
    throw new GcpError("Workload identity provider is required.");
  }
  if (!defaultZone) {
    throw new GcpError("Default zone is required.");
  }

  const result = await env.DB.prepare(
    "INSERT INTO gcp_accounts (name, project_id, project_number, service_account_email, workload_identity_provider, default_zone) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(
      name,
      projectId,
      projectNumber,
      serviceAccountEmail,
      workloadIdentityProvider,
      defaultZone
    )
    .run();

  return loadAccount(env, Number(result.meta.last_row_id));
}

export async function upsertAccountByProjectId(
  env: Env,
  input: CreateGcpAccountInput
): Promise<UpsertGcpAccountResult> {
  const projectId = input.projectId.trim();
  if (!projectId) {
    throw new GcpError("Project id is required.");
  }

  const existing = await env.DB.prepare(
    `SELECT ${ACCOUNT_COLUMNS} FROM gcp_accounts WHERE project_id = ? ORDER BY id ASC LIMIT 1`
  )
    .bind(projectId)
    .first<GcpAccountRow>();

  if (!existing) {
    return { account: await createAccount(env, input), created: true };
  }

  return {
    account: await updateAccount(env, existing.id, { ...input, enabled: true }),
    created: false
  };
}

export async function loadAccount(env: Env, accountId: number): Promise<GcpAccount> {
  const row = await loadAccountRow(env, accountId);
  return toGcpAccount(row);
}

export async function loadAccountRow(env: Env, accountId: number): Promise<GcpAccountRow> {
  const row = await env.DB.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM gcp_accounts WHERE id = ?`)
    .bind(accountId)
    .first<GcpAccountRow>();
  if (!row) {
    throw new GcpError("GCP account was not found.", 404);
  }
  return row;
}

export async function updateAccount(
  env: Env,
  accountId: number,
  input: UpdateGcpAccountInput
): Promise<GcpAccount> {
  const current = await loadAccountRow(env, accountId);
  const name = input.name === undefined ? current.name : input.name.trim();
  if (!name) {
    throw new GcpError("Account name is required.");
  }
  const projectId = input.projectId === undefined ? current.project_id : input.projectId.trim();
  const projectNumber =
    input.projectNumber === undefined ? current.project_number : input.projectNumber.trim();
  const serviceAccountEmail =
    input.serviceAccountEmail === undefined
      ? current.service_account_email
      : input.serviceAccountEmail.trim();
  const workloadIdentityProvider =
    input.workloadIdentityProvider === undefined
      ? current.workload_identity_provider
      : input.workloadIdentityProvider.trim();
  const defaultZone =
    input.defaultZone === undefined ? current.default_zone : input.defaultZone.trim();

  if (!projectId) {
    throw new GcpError("Project id is required.");
  }
  if (!projectNumber) {
    throw new GcpError("Project number is required.");
  }
  if (!serviceAccountEmail) {
    throw new GcpError("Service account email is required.");
  }
  if (!workloadIdentityProvider) {
    throw new GcpError("Workload identity provider is required.");
  }
  if (!defaultZone) {
    throw new GcpError("Default zone is required.");
  }

  const enabled = input.enabled === undefined ? current.enabled : input.enabled ? 1 : 0;
  await env.DB.prepare(
    "UPDATE gcp_accounts SET name = ?, project_id = ?, project_number = ?, service_account_email = ?, workload_identity_provider = ?, default_zone = ?, enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
  )
    .bind(
      name,
      projectId,
      projectNumber,
      serviceAccountEmail,
      workloadIdentityProvider,
      defaultZone,
      enabled,
      accountId
    )
    .run();
  return loadAccount(env, accountId);
}

export async function deleteAccount(env: Env, accountId: number): Promise<void> {
  await loadAccountRow(env, accountId);
  await env.DB.prepare("DELETE FROM gcp_accounts WHERE id = ?").bind(accountId).run();
}

export async function listEnabledAccountRows(env: Env): Promise<GcpAccountRow[]> {
  const result = await env.DB.prepare(
    `SELECT ${ACCOUNT_COLUMNS} FROM gcp_accounts WHERE enabled = 1 ORDER BY id DESC`
  ).all<GcpAccountRow>();
  return result.results;
}
