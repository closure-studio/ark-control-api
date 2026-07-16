import { asc, desc, eq, sql } from "drizzle-orm";

import { createDatabase } from "../../../../db/client";
import { gcpAccounts } from "../../../../db/schema";
import type { GcpAccount } from "../../../shared/api";
import type { GcpAccountRow } from "../../model/schema/gcp";
import { toGcpAccount } from "../../model/schema/gcp";
import type { Env } from "../../model/schema/worker";
import { GcpError } from "./errors";

export type CreateGcpAccountInput = {
  name: string;
  projectId: string;
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
  return createDatabase(env.DB).select().from(gcpAccounts).orderBy(desc(gcpAccounts.id)).all();
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
  const serviceAccountEmail = input.serviceAccountEmail.trim();
  const workloadIdentityProvider = input.workloadIdentityProvider.trim();
  const defaultZone = input.defaultZone.trim();

  if (!projectId) {
    throw new GcpError("Project id is required.");
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

  const inserted = await createDatabase(env.DB)
    .insert(gcpAccounts)
    .values({
      name,
      project_id: projectId,
      service_account_email: serviceAccountEmail,
      workload_identity_provider: workloadIdentityProvider,
      default_zone: defaultZone
    })
    .returning({ id: gcpAccounts.id })
    .get();

  return loadAccount(env, inserted.id);
}

export async function upsertAccountByProjectId(
  env: Env,
  input: CreateGcpAccountInput
): Promise<UpsertGcpAccountResult> {
  const projectId = input.projectId.trim();
  if (!projectId) {
    throw new GcpError("Project id is required.");
  }

  const existing = await createDatabase(env.DB)
    .select()
    .from(gcpAccounts)
    .where(eq(gcpAccounts.project_id, projectId))
    .orderBy(asc(gcpAccounts.id))
    .limit(1)
    .get();

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
  const row = await createDatabase(env.DB)
    .select()
    .from(gcpAccounts)
    .where(eq(gcpAccounts.id, accountId))
    .get();
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
  if (!serviceAccountEmail) {
    throw new GcpError("Service account email is required.");
  }
  if (!workloadIdentityProvider) {
    throw new GcpError("Workload identity provider is required.");
  }
  if (!defaultZone) {
    throw new GcpError("Default zone is required.");
  }

  const enabled = input.enabled ?? current.enabled;
  await createDatabase(env.DB)
    .update(gcpAccounts)
    .set({
      name,
      project_id: projectId,
      service_account_email: serviceAccountEmail,
      workload_identity_provider: workloadIdentityProvider,
      default_zone: defaultZone,
      enabled,
      updated_at: sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    })
    .where(eq(gcpAccounts.id, accountId))
    .run();
  return loadAccount(env, accountId);
}

export async function deleteAccount(env: Env, accountId: number): Promise<void> {
  await loadAccountRow(env, accountId);
  await createDatabase(env.DB).delete(gcpAccounts).where(eq(gcpAccounts.id, accountId)).run();
}

export async function listEnabledAccountRows(env: Env): Promise<GcpAccountRow[]> {
  return createDatabase(env.DB)
    .select()
    .from(gcpAccounts)
    .where(eq(gcpAccounts.enabled, true))
    .orderBy(desc(gcpAccounts.id))
    .all();
}
