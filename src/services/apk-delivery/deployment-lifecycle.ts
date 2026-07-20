import { CRON_INTERVAL_MS, FIRST_CHECK_DELAY_MS, HOST_RUN_DEADLINE_MS } from "../../constants/apk-delivery/config";
import {
  acquireControlJobLock,
  releaseControlJobLock
} from "../../repositories/control-job-locks";
import {
  getOrCreateHostRun,
  hasNonTerminalHostRuns,
  listDueRunningHostRuns,
  listPendingStartHostRuns,
  markHostRunStarted,
  updateHostRunExecution,
  updateHostRunReview,
  updateHostRunStatus
} from "../../repositories/apk-delivery/host-runs";
import {
  getLatestReleaseApkFilename,
  getOrCreateRelease,
  getReleaseApkFilename
} from "../../repositories/apk-delivery/releases";
import type { ArknightsApkHostRunRow } from "../../db/schema";
import type { Env } from "../../schemas/env";
import type { ExecuteHostCommandResult } from "../../schemas/vps/ssh-command";
import type { AiReviewStatus } from "../../schemas/apk-delivery/ai";
import type { NotificationEventType } from "../../schemas/apk-delivery/notifications";
import type { HostRunStatus } from "../../schemas/apk-delivery/status";
import { parseHostLogSnapshot } from "../../utils/apk-delivery/log";
import { buildLogTailCommand, buildStartCommand } from "../../utils/apk-delivery/shell";
import { fetchLatestApkMetadata } from "./apk";
import { reviewLogWithAi } from "./ai-review";
import { notifyDeploymentStarted, notifyHelperDeployTerminal } from "./notification";
import { executeHostCommand, listVpsHosts } from "./vps";

type ApkDeliveryRuntime = {
  now?: () => Date;
  fetcher?: typeof fetch;
  logger?: Pick<Console, "error">;
};

type ReviewResultLike = {
  status: AiReviewStatus;
  reason: string;
  protocolError?: boolean;
};

// Keep the persisted key stable so old and new Worker versions cannot overlap during rollout.
const APK_DELIVERY_LOCK_KEY = "pipeline_lock";
const APK_DELIVERY_LOCK_TTL_MS = 25 * 60 * 1000;

function normalizeReviewResult(
  review: ReviewResultLike
): ReviewResultLike & { protocolError: boolean } {
  return { ...review, protocolError: review.protocolError ?? false };
}

function createLockOwner(now: Date): string {
  return `apk-delivery:${now.getTime()}:${Math.random().toString(36).slice(2, 10)}`;
}

function formatCommandError(result: ExecuteHostCommandResult): string {
  if (result.stderr.trim()) return result.stderr.trim();
  if (!result.connected) return "host RPC disconnected";
  if (result.timedOut) return "host RPC timed out";
  return "host RPC command failed";
}

function formatUnknownError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function runNotification(
  eventType: NotificationEventType,
  action: () => Promise<void>,
  logger: Pick<Console, "error">
): Promise<void> {
  try {
    await action();
  } catch (error) {
    logger.error("notification dependency failed", {
      eventType,
      error: formatUnknownError(error, "notification failed")
    });
  }
}

function toIso(date: Date): string {
  return date.toISOString();
}

function addMs(date: Date, milliseconds: number): string {
  return new Date(date.getTime() + milliseconds).toISOString();
}

function isStartSuccess(stdout: string, success: boolean): boolean {
  return success || stdout.includes("already_running");
}

function requireHostId(run: ArknightsApkHostRunRow): number {
  if (run.host_id === null) throw new Error("host_run_host_deleted");
  return run.host_id;
}

async function advanceDueHostRuns(
  env: Env,
  runtime: ApkDeliveryRuntime,
  nowDate: Date
): Promise<void> {
  const now = toIso(nowDate);
  const retryAt = addMs(nowDate, CRON_INTERVAL_MS);
  const runs = await listDueRunningHostRuns(env.DB, now);
  const logger = runtime.logger ?? console;

  await Promise.all(
    runs.map(async (run) => {
      try {
        if (run.host_id === null) {
          await updateHostRunStatus(
            env.DB,
            run.id,
            "failed",
            now,
            "VPS host was deleted."
          );
          return;
        }
        if (run.deadline_at && Date.parse(run.deadline_at) <= nowDate.getTime()) {
          const result = "host run exceeded deadline";
          await updateHostRunStatus(env.DB, run.id, "timed_out", now, result);
          await runNotification(
            "helper_deploy_terminal",
            async () => {
              const apkFilename = await getReleaseApkFilename(env.DB, run.release_id);
              await notifyHelperDeployTerminal(
                env,
                {
                  hostId: requireHostId(run),
                  hostName: run.host_name_snapshot,
                  apkFilename,
                  status: "timed_out",
                  result
                },
                runtime
              );
            },
            logger
          );
          return;
        }

        const apkFilename = await getReleaseApkFilename(env.DB, run.release_id);
        const logResult = await executeHostCommand(
          env,
          requireHostId(run),
          buildLogTailCommand(apkFilename)
        );

        if (!logResult.success || logResult.timedOut || !logResult.connected) {
          await updateHostRunStatus(
            env.DB,
            run.id,
            "running",
            now,
            formatCommandError(logResult),
            retryAt
          );
          return;
        }

        const snapshot = parseHostLogSnapshot(logResult.stdout);
        if (snapshot.processState !== "exited" || snapshot.exitCode === null) {
          await updateHostRunExecution(env.DB, run.id, {
            status: "running",
            now,
            logTail: snapshot.logTail,
            nextCheckAt: retryAt,
            errorMessage:
              snapshot.processState === "unknown" ? "host process state unavailable" : null
          });
          return;
        }

        if (snapshot.exitCode !== 0) {
          const result = `Helper exited with code ${snapshot.exitCode}`;
          await updateHostRunExecution(env.DB, run.id, {
            status: "failed",
            now,
            logTail: snapshot.logTail,
            nextCheckAt: null,
            errorMessage: result
          });
          await runNotification(
            "helper_deploy_terminal",
            () =>
              notifyHelperDeployTerminal(
                env,
                {
                  hostId: requireHostId(run),
                  hostName: run.host_name_snapshot,
                  apkFilename,
                  status: "failed",
                  result
                },
                runtime
              ),
            logger
          );
          return;
        }

        const review = normalizeReviewResult(await reviewLogWithAi(env, snapshot.logTail));
        const shouldRetry =
          review.protocolError || review.status === "running" || review.status === "unknown";
        const hostStatus: HostRunStatus = shouldRetry
          ? "running"
          : review.status === "success"
            ? "succeeded"
            : "failed";

        await updateHostRunReview(env.DB, run.id, {
          status: hostStatus,
          now,
          logTail: snapshot.logTail,
          aiStatus: review.status,
          aiReason: review.reason,
          nextCheckAt: shouldRetry ? retryAt : null,
          errorMessage: review.protocolError ? review.reason : null
        });

        if (hostStatus === "succeeded" || hostStatus === "failed") {
          await runNotification(
            "helper_deploy_terminal",
            () =>
              notifyHelperDeployTerminal(
                env,
                {
                  hostId: requireHostId(run),
                  hostName: run.host_name_snapshot,
                  apkFilename,
                  status: hostStatus,
                  result: review.reason
                },
                runtime
              ),
            logger
          );
        }
      } catch (error) {
        await updateHostRunStatus(
          env.DB,
          run.id,
          "running",
          now,
          formatUnknownError(error, "host run advance failed"),
          retryAt
        );
      }
    })
  );
}

async function startPendingHostRuns(
  env: Env,
  runtime: ApkDeliveryRuntime,
  runs: ArknightsApkHostRunRow[],
  apkFilename: string,
  nowDate: Date
): Promise<void> {
  const now = toIso(nowDate);
  const firstCheckAt = addMs(nowDate, FIRST_CHECK_DELAY_MS);
  const deadlineAt = addMs(nowDate, HOST_RUN_DEADLINE_MS);
  const logger = runtime.logger ?? console;

  await Promise.all(
    runs.map(async (run) => {
      if (run.status !== "pending") return;
      if (run.host_id === null) {
        await updateHostRunStatus(
          env.DB,
          run.id,
          "failed",
          now,
          "VPS host was deleted."
        );
        return;
      }

      try {
        const result = await executeHostCommand(
          env,
          requireHostId(run),
          buildStartCommand(apkFilename)
        );
        if (!isStartSuccess(result.stdout, result.success)) {
          throw new Error(result.stderr || "start failed");
        }
        await markHostRunStarted(env.DB, run.id, now, firstCheckAt, deadlineAt);
      } catch (error) {
        const result = formatUnknownError(error, "start failed");
        await updateHostRunStatus(env.DB, run.id, "failed", now, result);
        await runNotification(
          "helper_deploy_terminal",
          () =>
            notifyHelperDeployTerminal(
              env,
              {
                hostId: requireHostId(run),
                hostName: run.host_name_snapshot,
                apkFilename,
                status: "failed",
                result
              },
              runtime
            ),
          logger
        );
      }
    })
  );
}

async function processNewApkRelease(
  env: Env,
  runtime: ApkDeliveryRuntime,
  nowDate: Date
): Promise<void> {
  const now = toIso(nowDate);
  const logger = runtime.logger ?? console;
  let metadata;
  try {
    metadata =
      runtime.fetcher === undefined
        ? await fetchLatestApkMetadata()
        : await fetchLatestApkMetadata(runtime.fetcher);
  } catch (error) {
    logger.error("APK delivery release check failed", {
      error: formatUnknownError(error, "APK check failed")
    });
    return;
  }

  if ((await getLatestReleaseApkFilename(env.DB)) === metadata.apkFilename) return;

  let hosts;
  try {
    hosts = await listVpsHosts(env);
  } catch (error) {
    logger.error("APK delivery VPS listing failed", {
      apkFilename: metadata.apkFilename,
      error: formatUnknownError(error, "failed to list VPS hosts")
    });
    return;
  }

  const release = await getOrCreateRelease(
    env.DB,
    metadata.apkFilename,
    metadata.finalUrl,
    now
  );
  const hostRunCreationErrors: string[] = [];
  const runs: ArknightsApkHostRunRow[] = [];

  await Promise.all(
    hosts.map(async (host) => {
      try {
        runs.push(await getOrCreateHostRun(env.DB, release.id, host, now));
      } catch (error) {
        hostRunCreationErrors.push(
          `host ${host.id}: ${formatUnknownError(error, "host run creation failed")}`
        );
      }
    })
  );

  if (hostRunCreationErrors.length > 0) {
    logger.error("APK delivery Host Run creation failed", {
      apkFilename: metadata.apkFilename,
      releaseId: release.id,
      errors: hostRunCreationErrors
    });
    return;
  }

  await startPendingHostRuns(env, runtime, runs, metadata.apkFilename, nowDate);
  await runNotification(
    "deployment_started",
    () => notifyDeploymentStarted(env, { apkFilename: metadata.apkFilename }, runtime),
    logger
  );
}

export async function runApkDeliveryCycle(
  env: Env,
  runtime: ApkDeliveryRuntime = {}
): Promise<void> {
  const nowDate = runtime.now?.() ?? new Date();
  const now = toIso(nowDate);
  const owner = createLockOwner(nowDate);
  const expiresAt = addMs(nowDate, APK_DELIVERY_LOCK_TTL_MS);
  const lockAcquired = await acquireControlJobLock(
    env.DB,
    APK_DELIVERY_LOCK_KEY,
    owner,
    expiresAt,
    now
  );
  if (!lockAcquired) return;

  try {
    await advanceDueHostRuns(env, runtime, nowDate);

    const pendingRuns = await listPendingStartHostRuns(env.DB);
    if (pendingRuns.length > 0) {
      const releaseIds = [...new Set(pendingRuns.map((run) => run.release_id))];
      await Promise.all(
        releaseIds.map(async (releaseId) => {
          const apkFilename = await getReleaseApkFilename(env.DB, releaseId);
          await startPendingHostRuns(
            env,
            runtime,
            pendingRuns.filter((run) => run.release_id === releaseId),
            apkFilename,
            nowDate
          );
        })
      );
    }

    if (await hasNonTerminalHostRuns(env.DB)) return;
    await processNewApkRelease(env, runtime, nowDate);
  } finally {
    await releaseControlJobLock(env.DB, APK_DELIVERY_LOCK_KEY, owner);
  }
}
