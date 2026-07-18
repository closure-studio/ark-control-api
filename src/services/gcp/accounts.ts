import { asc, desc, eq, sql } from "drizzle-orm";

import { createDatabase } from "../../db/client";
import { gcpAccounts, type GcpAccountRow } from "../../db/schema";
import { GcpError } from "../../errors/gcp";
import type { Env } from "../../schemas/env";
import type {
  CreateGcpAccountRequest,
  GcpAccount,
  UpdateGcpAccountRequest
} from "../../schemas/gcp/accounts";
import type { GcpAccountUpsertResult } from "../../schemas/gcp/responses";
import { toGcpAccount } from "../../utils/gcp/account";

export async function listAccountRows(env: Env): Promise<GcpAccountRow[]> {
  return createDatabase(env.DB).select().from(gcpAccounts).orderBy(desc(gcpAccounts.id)).all();
}

export async function listAccounts(env: Env): Promise<GcpAccount[]> {
  return (await listAccountRows(env)).map(toGcpAccount);
}

export async function createAccount(
  env: Env,
  input: CreateGcpAccountRequest
): Promise<GcpAccount> {
  const inserted = await createDatabase(env.DB)
    .insert(gcpAccounts)
    .values({
      name: input.name,
      project_id: input.projectId,
      service_account_email: input.serviceAccountEmail,
      workload_identity_provider: input.workloadIdentityProvider,
      default_zone: input.defaultZone
    })
    .returning({ id: gcpAccounts.id })
    .get();

  return loadAccount(env, inserted.id);
}

export async function upsertAccountByProjectId(
  env: Env,
  input: CreateGcpAccountRequest
): Promise<GcpAccountUpsertResult> {
  const existing = await createDatabase(env.DB)
    .select()
    .from(gcpAccounts)
    .where(eq(gcpAccounts.project_id, input.projectId))
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
  input: UpdateGcpAccountRequest
): Promise<GcpAccount> {
  const current = await loadAccountRow(env, accountId);
  const name = input.name ?? current.name;
  const projectId = input.projectId ?? current.project_id;
  const serviceAccountEmail = input.serviceAccountEmail ?? current.service_account_email;
  const workloadIdentityProvider =
    input.workloadIdentityProvider ?? current.workload_identity_provider;
  const defaultZone = input.defaultZone ?? current.default_zone;
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
