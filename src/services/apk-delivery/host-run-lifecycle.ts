import {
  HOST_RUN_CHECK_INTERVAL_MS,
  HOST_RUN_DEADLINE_MS
} from "../../constants/apk-delivery/config";
import type { ArknightsApkHostRunRow } from "../../db/schema";
import {
  listDueRunningHostRuns,
  markHostRunStarted,
  updateHostRunExecution,
  updateHostRunReview,
  updateHostRunStatus
} from "../../repositories/apk-delivery/host-runs";
import { getReleaseApkFilename } from "../../repositories/apk-delivery/releases";
import type { AiReviewStatus } from "../../schemas/apk-delivery/ai";
import type { NotificationEventType } from "../../schemas/apk-delivery/notifications";
import type { HostRunStatus } from "../../schemas/apk-delivery/status";
import type { Env } from "../../schemas/env";
import type { ExecuteHostCommandResult } from "../../schemas/vps/ssh-command";
import { parseHostLogSnapshot } from "../../utils/apk-delivery/log";
import { buildLogTailCommand, buildStartCommand } from "../../utils/apk-delivery/shell";
import { reviewLogWithAi } from "./ai-review";
import { notifyHelperDeployTerminal } from "./notification";
import { executeHostCommand } from "./vps";

type HostRunRuntime = {
  fetcher?: typeof fetch;
  logger?: Pick<Console, "error">;
};

type ReviewResultLike = {
  status: AiReviewStatus;
  reason: string;
  protocolError?: boolean;
};

function normalizeReviewResult(
  review: ReviewResultLike
): ReviewResultLike & { protocolError: boolean } {
  return { ...review, protocolError: review.protocolError ?? false };
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

async function retryHostRun(
  env: Env,
  runId: number,
  now: string,
  retryAt: string,
  error: unknown,
  fallback: string
): Promise<void> {
  await updateHostRunStatus(
    env.DB,
    runId,
    "running",
    now,
    formatUnknownError(error, fallback),
    retryAt
  );
}

async function advanceHostRun(
  env: Env,
  runtime: HostRunRuntime,
  run: ArknightsApkHostRunRow,
  nowDate: Date
): Promise<void> {
  const now = toIso(nowDate);
  const retryAt = addMs(nowDate, HOST_RUN_CHECK_INTERVAL_MS);
  const logger = runtime.logger ?? console;

  if (run.host_id === null) {
    await updateHostRunStatus(env.DB, run.id, "failed", now, "VPS host was deleted.");
    return;
  }
  const hostId = run.host_id;

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
            hostId,
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
  let logResult: ExecuteHostCommandResult;
  try {
    logResult = await executeHostCommand(env, hostId, buildLogTailCommand(apkFilename));
  } catch (error) {
    await retryHostRun(env, run.id, now, retryAt, error, "host run check failed");
    return;
  }

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
      errorMessage: snapshot.processState === "unknown" ? "host process state unavailable" : null
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
            hostId,
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

  let review: ReviewResultLike & { protocolError: boolean };
  try {
    review = normalizeReviewResult(await reviewLogWithAi(env, snapshot.logTail));
  } catch (error) {
    await retryHostRun(env, run.id, now, retryAt, error, "AI review failed");
    return;
  }

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
            hostId,
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
}

export async function advanceDueHostRuns(
  env: Env,
  runtime: HostRunRuntime,
  nowDate: Date
): Promise<void> {
  const runs = await listDueRunningHostRuns(env.DB, toIso(nowDate));
  await Promise.all(runs.map((run) => advanceHostRun(env, runtime, run, nowDate)));
}

async function failHostRunStart(
  env: Env,
  runtime: HostRunRuntime,
  run: ArknightsApkHostRunRow & { host_id: number },
  apkFilename: string,
  now: string,
  message: string
): Promise<void> {
  await updateHostRunStatus(env.DB, run.id, "failed", now, message);
  await runNotification(
    "helper_deploy_terminal",
    () =>
      notifyHelperDeployTerminal(
        env,
        {
          hostId: run.host_id,
          hostName: run.host_name_snapshot,
          apkFilename,
          status: "failed",
          result: message
        },
        runtime
      ),
    runtime.logger ?? console
  );
}

async function startHostRun(
  env: Env,
  runtime: HostRunRuntime,
  run: ArknightsApkHostRunRow,
  apkFilename: string,
  nowDate: Date
): Promise<void> {
  if (run.status !== "pending") return;
  const now = toIso(nowDate);
  if (run.host_id === null) {
    await updateHostRunStatus(env.DB, run.id, "failed", now, "VPS host was deleted.");
    return;
  }

  const activeRun = { ...run, host_id: run.host_id };
  let result: ExecuteHostCommandResult;
  try {
    result = await executeHostCommand(env, activeRun.host_id, buildStartCommand(apkFilename));
  } catch (error) {
    await failHostRunStart(
      env,
      runtime,
      activeRun,
      apkFilename,
      now,
      formatUnknownError(error, "start failed")
    );
    return;
  }

  if (!isStartSuccess(result.stdout, result.success)) {
    await failHostRunStart(
      env,
      runtime,
      activeRun,
      apkFilename,
      now,
      result.stderr || "start failed"
    );
    return;
  }

  await markHostRunStarted(
    env.DB,
    run.id,
    now,
    addMs(nowDate, HOST_RUN_CHECK_INTERVAL_MS),
    addMs(nowDate, HOST_RUN_DEADLINE_MS)
  );
}

export async function startPendingHostRuns(
  env: Env,
  runtime: HostRunRuntime,
  runs: ArknightsApkHostRunRow[],
  apkFilename: string,
  nowDate: Date
): Promise<void> {
  await Promise.all(runs.map((run) => startHostRun(env, runtime, run, apkFilename, nowDate)));
}
