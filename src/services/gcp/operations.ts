import { count, desc } from "drizzle-orm";

import { createDatabase } from "../../db/client";
import { gcpOperationLogs } from "../../db/schema";
import type {
  GcpInstanceLifecycleTarget,
  GcpInstanceLifecycleAction,
  GcpOperationResult
} from "../../schemas/gcp/operations";
import type { Env } from "../../schemas/env";
import { createPyHelperDownloadUrl } from "../pyhelper/download-url";
import { loadAccountRow } from "./accounts";
import { fetchGoogleAccessToken } from "./auth";
import { createDefaultInstance, submitInstanceAction, waitForZoneOperation } from "./compute";
import { buildDefaultVpsStartupScript } from "./startup-script";

export function shouldSkipAction(action: GcpInstanceLifecycleAction, status?: string): boolean {
  return (
    (action === "start" && status === "RUNNING") ||
    (action === "stop" && status === "TERMINATED")
  );
}

export async function recordOperation(
  env: Env,
  result: GcpOperationResult,
  context: { batchId: string; accountId: number | null; accountName?: string }
): Promise<void> {
  const createdAt = new Date().toISOString();
  await createDatabase(env.DB)
    .insert(gcpOperationLogs)
    .values({
      batch_id: context.batchId,
      account_id: context.accountId,
      account_name_snapshot: context.accountName ?? null,
      project_id: result.projectId,
      zone: result.zone,
      instance_name: result.instanceName,
      action: result.action,
      status: result.status,
      google_operation_name: result.googleOperationName ?? null,
      message: result.message ?? null,
      created_at: createdAt
    })
    .run();
}

export async function listOperations(env: Env, limit: number, offset: number) {
  const rows = await createDatabase(env.DB)
    .select()
    .from(gcpOperationLogs)
    .orderBy(desc(gcpOperationLogs.created_at), desc(gcpOperationLogs.id))
    .limit(limit)
    .offset(offset)
    .all();
  return rows.map((row) => ({
    id: row.id,
    batchId: row.batch_id,
    accountId: row.account_id,
    accountName: row.account_name_snapshot,
    projectId: row.project_id,
    zone: row.zone,
    instanceName: row.instance_name,
    action: row.action,
    status: row.status,
    message: row.message,
    googleOperationName: row.google_operation_name,
    createdAt: row.created_at
  }));
}

export async function countOperations(env: Env): Promise<number> {
  const row = await createDatabase(env.DB)
    .select({ value: count() })
    .from(gcpOperationLogs)
    .get();
  return row?.value ?? 0;
}

export async function submitBatchInstanceAction(
  env: Env,
  action: GcpInstanceLifecycleAction,
  targets: GcpInstanceLifecycleTarget[],
  options: { fetch?: typeof fetch } = {}
): Promise<GcpOperationResult[]> {
  const fetcher = options.fetch ?? fetch;
  const batchId = crypto.randomUUID();
  const results: GcpOperationResult[] = [];
  const byAccount = new Map<number, GcpInstanceLifecycleTarget[]>();

  for (const target of targets) {
    byAccount.set(target.accountId, [...(byAccount.get(target.accountId) ?? []), target]);
  }

  for (const [accountId, accountTargets] of byAccount) {
    let account;
    try {
      account = await loadAccountRow(env, accountId);
    } catch (error) {
      for (const target of accountTargets) {
        const result: GcpOperationResult = {
          accountId,
          projectId: target.projectId,
          zone: target.zone,
          instanceName: target.instanceName,
          action,
          status: "failed",
          message: error instanceof Error ? error.message : "Unable to load account."
        };
        await recordOperation(env, result, { batchId, accountId: null });
        results.push(result);
      }
      continue;
    }

    const actionTargets: GcpInstanceLifecycleTarget[] = [];
    for (const target of accountTargets) {
      if (shouldSkipAction(action, target.status)) {
        const result: GcpOperationResult = {
          accountId,
          projectId: target.projectId,
          zone: target.zone,
          instanceName: target.instanceName,
          action,
          status: "skipped",
          message: action === "start" ? "Instance is already running." : "Instance is already stopped."
        };
        await recordOperation(env, result, { batchId, accountId: account.id, accountName: account.name });
        results.push(result);
      } else {
        actionTargets.push(target);
      }
    }

    if (actionTargets.length === 0) {
      continue;
    }

    let accessToken: string | null = null;
    try {
      accessToken = await fetchGoogleAccessToken(env, account, { fetch: fetcher });
    } catch (error) {
      for (const target of actionTargets) {
        const result: GcpOperationResult = {
          accountId,
          projectId: target.projectId,
          zone: target.zone,
          instanceName: target.instanceName,
          action,
          status: "failed",
          message: error instanceof Error ? error.message : "Unable to authenticate account."
        };
        await recordOperation(env, result, { batchId, accountId: account.id, accountName: account.name });
        results.push(result);
      }
      continue;
    }

    for (const target of actionTargets) {
      try {
        const operationName = await submitInstanceAction({
          fetcher,
          accessToken,
          projectId: target.projectId,
          zone: target.zone,
          instanceName: target.instanceName,
          action
        });
        const result: GcpOperationResult = {
          accountId,
          projectId: target.projectId,
          zone: target.zone,
          instanceName: target.instanceName,
          action,
          status: "submitted",
          ...(operationName !== undefined ? { googleOperationName: operationName } : {})
        };
        await recordOperation(env, result, { batchId, accountId: account.id, accountName: account.name });
        results.push(result);
      } catch (error) {
        const result: GcpOperationResult = {
          accountId,
          projectId: target.projectId,
          zone: target.zone,
          instanceName: target.instanceName,
          action,
          status: "failed",
          message: error instanceof Error ? error.message : "Unable to submit instance action."
        };
        await recordOperation(env, result, { batchId, accountId: account.id, accountName: account.name });
        results.push(result);
      }
    }
  }

  return results;
}

function defaultInstanceName(now = Date.now()): string {
  return `ark-vps-${now.toString(36)}`;
}

async function buildPyHelperStartupScript(input: {
  env: Env;
  workerBaseUrl?: string;
  nowMs?: number;
}): Promise<string> {
  if (!input.workerBaseUrl?.trim()) {
    throw new Error("Missing Worker base URL for PyHelper downloads.");
  }

  const now = () => Math.floor((input.nowMs ?? Date.now()) / 1000);
  const [arm64Url, amd64Url] = await Promise.all([
    createPyHelperDownloadUrl({
      assetName: "Helper-arm64",
      baseUrl: input.workerBaseUrl,
      token: input.env.GITHUB_PYHELPER_TOKEN,
      now
    }),
    createPyHelperDownloadUrl({
      assetName: "Helper-amd64",
      baseUrl: input.workerBaseUrl,
      token: input.env.GITHUB_PYHELPER_TOKEN,
      now
    })
  ]);

  return buildDefaultVpsStartupScript({
    pyHelperArm64DownloadUrl: arm64Url.toString(),
    pyHelperAmd64DownloadUrl: amd64Url.toString()
  });
}

export async function createDefaultVps(
  env: Env,
  accountId: number,
  options: {
    fetch?: typeof fetch;
    now?: () => number;
    operationPollDelayMs?: number;
    workerBaseUrl?: string;
  } = {}
): Promise<GcpOperationResult> {
  const fetcher = options.fetch ?? fetch;
  const account = await loadAccountRow(env, accountId);
  const nowMs = options.now?.();
  const batchId = crypto.randomUUID();
  const instanceName = defaultInstanceName(nowMs);
  const resultBase: Pick<
    GcpOperationResult,
    "accountId" | "projectId" | "zone" | "instanceName" | "action"
  > = {
    accountId: account.id,
    projectId: account.project_id,
    zone: account.default_zone,
    instanceName,
    action: "create",
  };
  let operationName: string | undefined;

  try {
    const startupScript = await buildPyHelperStartupScript({
      env,
      ...(options.workerBaseUrl !== undefined
        ? { workerBaseUrl: options.workerBaseUrl }
        : {}),
      ...(nowMs !== undefined ? { nowMs } : {})
    });
    const accessToken = await fetchGoogleAccessToken(env, account, { fetch: fetcher });
    operationName = await createDefaultInstance({
      fetcher,
      accessToken,
      projectId: account.project_id,
      zone: account.default_zone,
      instanceName,
      startupScript
    });
    if (operationName) {
      await waitForZoneOperation({
        fetcher,
        accessToken,
        projectId: account.project_id,
        zone: account.default_zone,
        operationName,
        delayMs: options.operationPollDelayMs ?? 1_500
      });
    }
    const result: GcpOperationResult = {
      ...resultBase,
      status: "succeeded",
      ...(operationName !== undefined ? { googleOperationName: operationName } : {})
    };
    await recordOperation(env, result, { batchId, accountId: account.id, accountName: account.name });
    return result;
  } catch (error) {
    const result: GcpOperationResult = {
      ...resultBase,
      status: "failed",
      message: error instanceof Error ? error.message : "Unable to create VPS.",
      ...(operationName !== undefined ? { googleOperationName: operationName } : {})
    };
    await recordOperation(env, result, { batchId, accountId: account.id, accountName: account.name });
    return result;
  }
}
