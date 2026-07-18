import { CRON_INTERVAL_MS, FIRST_CHECK_DELAY_MS, HOST_RUN_DEADLINE_MS } from "../../constants/watcher/config";
import { acquireAppStateLock, releaseAppStateLock } from "../../repositories/watcher/app-state";
import {
  getOrCreateHostRun,
  hasNonTerminalHostRuns,
  listDueRunningHostRuns,
  listPendingStartHostRuns,
  markHostRunStarted,
  updateHostRunExecution,
  updateHostRunReview,
  updateHostRunStatus,
} from "../../repositories/watcher/host-runs";
import { getLatestReleaseApkFilename, getOrCreateRelease, getReleaseApkFilename } from "../../repositories/watcher/releases";
import type { WatcherDeploymentRow as HostRunRow } from "../../db/schema";
import type { Env } from "../../schemas/env";
import type { ServiceVpsHost } from "../../schemas/vps/hosts";
import type { ExecuteHostCommandResult } from "../../schemas/vps/ssh-command";
import type { AiReviewStatus } from "../../schemas/watcher/ai";
import type { ApkMetadata } from "../../schemas/watcher/apk";
import type {
  NotificationEventType,
  NotifyHelperDeployTerminalInput,
  NotifyPipelineStartedInput
} from "../../schemas/watcher/notifications";
import type { HostRunStatus } from "../../schemas/watcher/status";
import { parseHostLogSnapshot } from "../../utils/watcher/log";
import { buildLogTailCommand, buildStartCommand } from "../../utils/watcher/shell";
import { fetchLatestApkMetadata } from "./apk";
import { reviewLogWithAi } from "./ai-review";
import { notifyHelperDeployTerminal, notifyPipelineStarted } from "./notification";
import { executeHostCommand, listVpsHosts } from "./vps";

export interface PipelineDependencies {
  now: () => Date;
  acquirePipelineLock: (input: { owner: string; expiresAt: string; now: string }) => Promise<boolean>;
  releasePipelineLock: (input: { owner: string }) => Promise<void>;
  hasNonTerminalHostRuns: () => Promise<boolean>;
  listDueRunningHostRuns: (now: string) => Promise<HostRunRow[]>;
  listPendingStartHostRuns: () => Promise<HostRunRow[]>;
  fetchApk: () => Promise<ApkMetadata>;
  getLastProcessedApkFilename: () => Promise<string | null>;
  listVpsHosts: () => Promise<ServiceVpsHost[]>;
  getOrCreateRelease: (input: { apkFilename: string; finalUrl: string; now: string }) => Promise<{ id: number }>;
  getOrCreateHostRun: (input: { releaseId: number; host: ServiceVpsHost; now: string }) => Promise<HostRunRow>;
  executeHostCommand: (input: { hostId: number; command: string }) => Promise<ExecuteHostCommandResult>;
  markHostRunStarted: (input: { id: number; startedAt: string; nextCheckAt: string; deadlineAt: string }) => Promise<void>;
  updateHostRunStatus: (input: {
    id: number;
    status: HostRunStatus;
    now: string;
    errorMessage: string | null;
    nextCheckAt?: string | null;
    failureStage?: HostRunRow["failure_stage"];
  }) => Promise<void>;
  updateHostRunExecution: (input: {
    id: number;
    status: HostRunStatus;
    now: string;
    logTail: string;
    nextCheckAt: string | null;
    errorMessage: string | null;
  }) => Promise<void>;
  getReleaseApkFilename: (releaseId: number) => Promise<string>;
  reviewLogTail: (logTail: string) => Promise<ReviewResultLike>;
  updateHostRunReview: (input: {
    id: number;
    status: HostRunStatus;
    now: string;
    logTail: string;
    aiStatus: AiReviewStatus;
    aiReason: string;
    nextCheckAt: string | null;
    errorMessage: string | null;
  }) => Promise<void>;
  notifyPipelineStarted: (input: NotifyPipelineStartedInput) => Promise<void>;
  notifyHelperDeployTerminal: (input: NotifyHelperDeployTerminalInput) => Promise<void>;
}

type ReviewResultLike = {
  status: AiReviewStatus;
  reason: string;
  protocolError?: boolean;
};

function normalizeReviewResult(review: ReviewResultLike): ReviewResultLike & { protocolError: boolean } {
  return { ...review, protocolError: review.protocolError ?? false };
}

const PIPELINE_LOCK_KEY = "pipeline_lock";
const PIPELINE_LOCK_TTL_MS = 25 * 60 * 1000;

function createLockOwner(nowDate: Date): string {
  return `pipeline:${nowDate.getTime()}:${Math.random().toString(36).slice(2, 10)}`;
}

function formatCommandError(result: ExecuteHostCommandResult): string {
  if (result.stderr.trim()) {
    return result.stderr.trim();
  }
  if (!result.connected) {
    return "host RPC disconnected";
  }
  if (result.timedOut) {
    return "host RPC timed out";
  }
  return "host RPC command failed";
}

function formatUnknownError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function runNotification(
  eventType: NotificationEventType,
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error("notification dependency failed", {
      eventType,
      error: formatUnknownError(error, "notification failed"),
    });
  }
}

export function createPipelineDependencies(env: Env): PipelineDependencies {
  return {
    now: () => new Date(),
    acquirePipelineLock: ({ owner, expiresAt, now }) => acquireAppStateLock(env.DB, PIPELINE_LOCK_KEY, owner, expiresAt, now),
    releasePipelineLock: ({ owner }) => releaseAppStateLock(env.DB, PIPELINE_LOCK_KEY, owner),
    hasNonTerminalHostRuns: () => hasNonTerminalHostRuns(env.DB),
    listDueRunningHostRuns: (now) => listDueRunningHostRuns(env.DB, now),
    listPendingStartHostRuns: () => listPendingStartHostRuns(env.DB),
    fetchApk: () => fetchLatestApkMetadata(),
    getLastProcessedApkFilename: () => getLatestReleaseApkFilename(env.DB),
    listVpsHosts: () => listVpsHosts(env),
    getOrCreateRelease: ({ apkFilename, finalUrl, now }) => getOrCreateRelease(env.DB, apkFilename, finalUrl, now),
    getOrCreateHostRun: ({ releaseId, host, now }) => getOrCreateHostRun(env.DB, releaseId, host, now),
    executeHostCommand: ({ hostId, command }) => executeHostCommand(env, hostId, command),
    markHostRunStarted: ({ id, startedAt, nextCheckAt, deadlineAt }) =>
      markHostRunStarted(env.DB, id, startedAt, nextCheckAt, deadlineAt),
    updateHostRunStatus: ({ id, status, now, errorMessage, nextCheckAt, failureStage }) =>
      updateHostRunStatus(env.DB, id, status, now, errorMessage, nextCheckAt ?? null, failureStage),
    updateHostRunExecution: ({ id, status, now, logTail, nextCheckAt, errorMessage }) =>
      updateHostRunExecution(env.DB, id, { status, now, logTail, nextCheckAt, errorMessage }),
    getReleaseApkFilename: (releaseId) => getReleaseApkFilename(env.DB, releaseId),
    reviewLogTail: (logTail) => reviewLogWithAi(env, logTail),
    updateHostRunReview: ({ id, status, now, logTail, aiStatus, aiReason, nextCheckAt, errorMessage }) =>
      updateHostRunReview(env.DB, id, {
        status,
        now,
        logTail,
        aiStatus,
        aiReason,
        nextCheckAt,
        errorMessage
      }),
    notifyPipelineStarted: (input) => notifyPipelineStarted(env, input),
    notifyHelperDeployTerminal: (input) => notifyHelperDeployTerminal(env, input),
  };
}

function toIso(date: Date): string {
  return date.toISOString();
}

function addMs(date: Date, ms: number): string {
  return new Date(date.getTime() + ms).toISOString();
}

function isStartSuccess(stdout: string, success: boolean): boolean {
  return success || stdout.includes("already_running");
}

function requireHostId(run: HostRunRow): number {
  if (run.host_id === null) throw new Error("deployment_host_deleted");
  return run.host_id;
}

async function advanceDueRuns(deps: PipelineDependencies, nowDate: Date): Promise<void> {
  const now = toIso(nowDate);
  const retryAt = addMs(nowDate, CRON_INTERVAL_MS);
  const runs = await deps.listDueRunningHostRuns(now);

  await Promise.all(
    runs.map(async (run) => {
      try {
        if (run.host_id === null) {
          await deps.updateHostRunStatus({
            id: run.id,
            status: "failed",
            now,
            errorMessage: "VPS host was deleted.",
            failureStage: "ssh"
          });
          return;
        }
        if (run.deadline_at && Date.parse(run.deadline_at) <= nowDate.getTime()) {
          const result = "host run exceeded deadline";
          await deps.updateHostRunStatus({
            id: run.id,
            status: "timed_out",
            now,
            errorMessage: result,
            failureStage: "deadline",
          });
          await runNotification("helper_deploy_terminal", async () => {
            const apkFilename = await deps.getReleaseApkFilename(run.release_id);
            await deps.notifyHelperDeployTerminal({
              hostId: requireHostId(run),
              hostName: run.host_name_snapshot,
              apkFilename,
              status: "timed_out",
              result,
            });
          });
          return;
        }

        const apkFilename = await deps.getReleaseApkFilename(run.release_id);
        const logResult = await deps.executeHostCommand({
          hostId: requireHostId(run),
          command: buildLogTailCommand(apkFilename),
        });

        if (!logResult.success || logResult.timedOut || !logResult.connected) {
          await deps.updateHostRunStatus({
            id: run.id,
            status: "running",
            now,
            errorMessage: formatCommandError(logResult),
            nextCheckAt: retryAt,
            failureStage: "ssh",
          });
          return;
        }

        const snapshot = parseHostLogSnapshot(logResult.stdout);
        if (snapshot.processState !== "exited" || snapshot.exitCode === null) {
          const errorMessage = snapshot.processState === "unknown" ? "host process state unavailable" : null;
          await deps.updateHostRunExecution({
            id: run.id,
            status: "running",
            now,
            logTail: snapshot.logTail,
            nextCheckAt: retryAt,
            errorMessage,
          });
          return;
        }

        if (snapshot.exitCode !== 0) {
          const result = `Helper exited with code ${snapshot.exitCode}`;
          await deps.updateHostRunExecution({
            id: run.id,
            status: "failed",
            now,
            logTail: snapshot.logTail,
            nextCheckAt: null,
            errorMessage: result,
          });
          await runNotification("helper_deploy_terminal", () =>
            deps.notifyHelperDeployTerminal({
              hostId: requireHostId(run),
              hostName: run.host_name_snapshot,
              apkFilename,
              status: "failed",
              result,
            }),
          );
          return;
        }

        const review = normalizeReviewResult(await deps.reviewLogTail(snapshot.logTail));
        const shouldRetry = review.protocolError || review.status === "running" || review.status === "unknown";
        const hostStatus: HostRunStatus = shouldRetry
          ? "running"
          : review.status === "success"
            ? "succeeded"
            : "failed";
        const nextCheckAt = shouldRetry ? retryAt : null;

        await deps.updateHostRunReview({
          id: run.id,
          status: hostStatus,
          now,
          logTail: snapshot.logTail,
          aiStatus: review.status,
          aiReason: review.reason,
          nextCheckAt,
          errorMessage: review.protocolError ? review.reason : null
        });

        if (hostStatus === "succeeded" || hostStatus === "failed") {
          await runNotification("helper_deploy_terminal", () =>
            deps.notifyHelperDeployTerminal({
              hostId: requireHostId(run),
              hostName: run.host_name_snapshot,
              apkFilename,
              status: hostStatus,
              result: review.reason,
            }),
          );
        }
      } catch (error) {
        await deps.updateHostRunStatus({
          id: run.id,
          status: "running",
          now,
          errorMessage: error instanceof Error ? error.message : "host run advance failed",
          nextCheckAt: retryAt,
        });
      }
    }),
  );
}

async function startPendingHostRuns(
  deps: PipelineDependencies,
  runs: HostRunRow[],
  apkFilename: string,
  nowDate: Date,
): Promise<void> {
  const now = toIso(nowDate);
  const firstCheckAt = addMs(nowDate, FIRST_CHECK_DELAY_MS);
  const deadlineAt = addMs(nowDate, HOST_RUN_DEADLINE_MS);

  await Promise.all(
    runs.map(async (run) => {
      if (run.status !== "pending") {
        return;
      }

      if (run.host_id === null) {
        await deps.updateHostRunStatus({
          id: run.id,
          status: "failed",
          now,
          errorMessage: "VPS host was deleted.",
          failureStage: "start"
        });
        return;
      }

      try {
        const result = await deps.executeHostCommand({
          hostId: requireHostId(run),
          command: buildStartCommand(apkFilename),
        });

        if (!isStartSuccess(result.stdout, result.success)) {
          throw new Error(result.stderr || "start failed");
        }

        await deps.markHostRunStarted({
          id: run.id,
          startedAt: now,
          nextCheckAt: firstCheckAt,
          deadlineAt,
        });
      } catch (error) {
        const result = error instanceof Error ? error.message : "start failed";
        await deps.updateHostRunStatus({
          id: run.id,
          status: "failed",
          now,
          errorMessage: result,
          failureStage: "start",
        });
        await runNotification("helper_deploy_terminal", () =>
          deps.notifyHelperDeployTerminal({
            hostId: requireHostId(run),
            hostName: run.host_name_snapshot,
            apkFilename,
            status: "failed",
            result,
          }),
        );
      }
    }),
  );
}

async function processNewApk(deps: PipelineDependencies, nowDate: Date): Promise<void> {
  const now = toIso(nowDate);

  let metadata: ApkMetadata;
  try {
    metadata = await deps.fetchApk();
  } catch (error) {
    const message = error instanceof Error ? error.message : "APK check failed";
    console.error("watcher APK check failed", { error: message });
    return;
  }

  const lastProcessedApkFilename = await deps.getLastProcessedApkFilename();

  if (lastProcessedApkFilename === metadata.apkFilename) {
    return;
  }

  let hosts: ServiceVpsHost[];
  try {
    hosts = await deps.listVpsHosts();
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to list VPS hosts";
    console.error("watcher VPS listing failed", { apkFilename: metadata.apkFilename, error: message });
    return;
  }

  const release = await deps.getOrCreateRelease({
    apkFilename: metadata.apkFilename,
    finalUrl: metadata.finalUrl,
    now,
  });
  const hostRunCreationErrors: string[] = [];
  const runs: HostRunRow[] = [];

  await Promise.all(
    hosts.map(async (host) => {
      try {
        runs.push(await deps.getOrCreateHostRun({ releaseId: release.id, host, now }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "host run creation failed";
        hostRunCreationErrors.push(`host ${host.id}: ${message}`);
      }
    }),
  );

  if (hostRunCreationErrors.length > 0) {
    console.error("watcher deployment creation failed", {
      apkFilename: metadata.apkFilename,
      releaseId: release.id,
      errors: hostRunCreationErrors
    });
    return;
  }

  await startPendingHostRuns(deps, runs, metadata.apkFilename, nowDate);
  await runNotification("pipeline_started", () =>
    deps.notifyPipelineStarted({
      apkFilename: metadata.apkFilename,
    }),
  );
}

export async function runPipeline(deps: PipelineDependencies): Promise<void> {
  const nowDate = deps.now();
  const now = toIso(nowDate);
  const owner = createLockOwner(nowDate);
  const expiresAt = addMs(nowDate, PIPELINE_LOCK_TTL_MS);
  const lockAcquired = await deps.acquirePipelineLock({ owner, expiresAt, now });

  if (!lockAcquired) {
    return;
  }

  try {
    await advanceDueRuns(deps, nowDate);

    const pendingStartRuns = await deps.listPendingStartHostRuns();
    if (pendingStartRuns.length > 0) {
      const releaseIds = [...new Set(pendingStartRuns.map((run) => run.release_id))];
      await Promise.all(
        releaseIds.map(async (releaseId) => {
          const apkFilename = await deps.getReleaseApkFilename(releaseId);
          const runsForRelease = pendingStartRuns.filter((run) => run.release_id === releaseId);
          await startPendingHostRuns(deps, runsForRelease, apkFilename, nowDate);
        }),
      );
    }

    if (await deps.hasNonTerminalHostRuns()) {
      return;
    }

    await processNewApk(deps, nowDate);
  } finally {
    await deps.releasePipelineLock({ owner });
  }
}

export async function runPipelineForEnv(env: Env): Promise<void> {
  await runPipeline(createPipelineDependencies(env));
}
