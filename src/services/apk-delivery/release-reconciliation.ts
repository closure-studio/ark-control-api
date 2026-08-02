import type { ArknightsApkHostRunRow } from "../../db/schema";
import {
  getHostRunForReleaseHost,
  getOrCreateHostRun
} from "../../repositories/apk-delivery/host-runs";
import {
  getLatestReleaseApkFilename,
  getOrCreateRelease
} from "../../repositories/apk-delivery/releases";
import type { Env } from "../../schemas/env";
import { fetchLatestApkMetadata } from "./apk";
import { startPendingHostRuns } from "./host-run-lifecycle";
import { notifyDeploymentStarted } from "./notification";
import { listVpsHosts } from "./vps";

type ReleaseRuntime = {
  fetcher?: typeof fetch;
  logger?: Pick<Console, "error">;
};

type HostRunCreationResult = {
  run: ArknightsApkHostRunRow | null;
  created: boolean;
  error: string | null;
};

function formatUnknownError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function reconcileLatestApkRelease(
  env: Env,
  runtime: ReleaseRuntime,
  nowDate: Date
): Promise<void> {
  const now = nowDate.toISOString();
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

  const isNewRelease = (await getLatestReleaseApkFilename(env.DB)) !== metadata.apkFilename;

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

  const release = await getOrCreateRelease(env.DB, metadata.apkFilename, metadata.finalUrl, now);
  const creationResults = await Promise.all(
    hosts.map(async (host): Promise<HostRunCreationResult> => {
      try {
        const existing = await getHostRunForReleaseHost(env.DB, release.id, host.id);
        return {
          run: await getOrCreateHostRun(env.DB, release.id, host, now),
          created: existing === null,
          error: null
        };
      } catch (error) {
        return {
          run: null,
          created: false,
          error: `host ${host.id}: ${formatUnknownError(error, "host run creation failed")}`
        };
      }
    })
  );
  const errors = creationResults.flatMap((result) => (result.error === null ? [] : [result.error]));

  if (errors.length > 0) {
    logger.error("APK delivery Host Run creation failed", {
      apkFilename: metadata.apkFilename,
      releaseId: release.id,
      errors
    });
    throw new Error("One or more APK Host Runs could not be persisted.");
  }

  const runs = creationResults.flatMap((result) => (result.run === null ? [] : [result.run]));
  if (!isNewRelease && !creationResults.some((result) => result.created)) return;

  await startPendingHostRuns(env, runtime, runs, metadata.apkFilename, nowDate);
  try {
    await notifyDeploymentStarted(env, { apkFilename: metadata.apkFilename }, runtime);
  } catch (error) {
    logger.error("notification dependency failed", {
      eventType: "deployment_started",
      error: formatUnknownError(error, "notification failed")
    });
  }
}
