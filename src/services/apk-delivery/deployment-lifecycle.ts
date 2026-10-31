import {
  APK_RELEASE_CHECK_INTERVAL_MS,
  HOST_RUN_CHECK_INTERVAL_MS
} from "../../constants/apk-delivery/config";
import type { Env } from "../../schemas/env";
import {
  listPendingStartHostRuns,
  listRunningHostRuns,
  updateHostRunStatus
} from "../../repositories/apk-delivery/host-runs";
import { getReleaseApkFilename } from "../../repositories/apk-delivery/releases";
import { nextCompatibilityCheck } from "../../repositories/apk-delivery/compatibility";
import { advanceCompatibilityRuns } from "./compatibility";
import { advanceDueHostRuns, startPendingHostRuns } from "./host-run-lifecycle";
import { reconcileLatestApkRelease } from "./release-reconciliation";

type ApkDeliveryRuntime = {
  now?: () => Date;
  fetcher?: typeof fetch;
  logger?: Pick<Console, "error">;
};

export async function runApkDeliveryCycle(
  env: Env,
  runtime: ApkDeliveryRuntime = {}
): Promise<Date> {
  const nowDate = runtime.now?.() ?? new Date();
  await Promise.all([
    advanceCompatibilityRuns(env, runtime, nowDate).catch(() =>
      (runtime.logger ?? console).error(
        "Compatibility polling failed; installation remains independent"
      )
    ),
    advanceInstallations(env, runtime, nowDate)
  ]);
  return getNextApkDeliveryAlarmAt(env.DB, nowDate);
}

async function advanceInstallations(
  env: Env,
  runtime: ApkDeliveryRuntime,
  nowDate: Date
): Promise<void> {
  await failInvalidRunningHostRuns(env, nowDate);
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

  if ((await listRunningHostRuns(env.DB)).length === 0) {
    await reconcileLatestApkRelease(env, runtime, nowDate);
  }
}

async function failInvalidRunningHostRuns(env: Env, now: Date): Promise<void> {
  const runs = await listRunningHostRuns(env.DB);
  await Promise.all(
    runs.map(async (run) => {
      const nextCheckAt = run.next_check_at === null ? Number.NaN : Date.parse(run.next_check_at);
      const deadlineAt = run.deadline_at === null ? Number.NaN : Date.parse(run.deadline_at);
      if (Number.isFinite(nextCheckAt) && Number.isFinite(deadlineAt)) return;
      await updateHostRunStatus(
        env.DB,
        run.id,
        "failed",
        now.toISOString(),
        "Host run schedule is invalid."
      );
    })
  );
}

export async function getNextApkDeliveryAlarmAt(db: D1Database, now: Date): Promise<Date> {
  const pendingAt =
    (await listPendingStartHostRuns(db)).length > 0
      ? now.getTime() + HOST_RUN_CHECK_INTERVAL_MS
      : Number.POSITIVE_INFINITY;
  const running = await listRunningHostRuns(db);
  const compatibilityAt = await nextCompatibilityCheck(db);
  let earliest = Math.min(
    pendingAt,
    compatibilityAt === null ? Number.POSITIVE_INFINITY : Date.parse(compatibilityAt)
  );
  for (const run of running) {
    const nextCheckAt = run.next_check_at === null ? Number.NaN : Date.parse(run.next_check_at);
    const deadlineAt = run.deadline_at === null ? Number.NaN : Date.parse(run.deadline_at);
    if (!Number.isFinite(nextCheckAt) || !Number.isFinite(deadlineAt)) return now;
    earliest = Math.min(earliest, nextCheckAt, deadlineAt);
  }
  if (Number.isFinite(earliest)) return new Date(Math.max(now.getTime(), earliest));

  const timestamp = now.getTime();
  return new Date(
    (Math.floor(timestamp / APK_RELEASE_CHECK_INTERVAL_MS) + 1) * APK_RELEASE_CHECK_INTERVAL_MS
  );
}
