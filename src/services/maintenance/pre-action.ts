import * as v from "valibot";

import {
  MAINTENANCE_PRE_ACTION_CONFIG_URL,
  MAINTENANCE_PRE_ACTION_LOGIN_URL,
  MAINTENANCE_PRE_ACTION_RESTART_COMMAND,
  MAINTENANCE_PRE_ACTION_SSH_TIMEOUT_MS
} from "../../constants/maintenance/config";
import {
  claimDueMaintenancePreAction,
  completeMaintenancePreAction,
  createMaintenanceHostRun,
  failInterruptedMaintenancePreActions,
  failMaintenanceHostRun,
  failMaintenancePreAction,
  failMissedMaintenancePreActions,
  finishMaintenanceHostRun
} from "../../repositories/maintenance/pre-actions";
import { VpsHostRepository, type VpsHostRecord } from "../../repositories/vps/vps-hosts";
import type { ArknightsMaintenanceAnnouncementRow } from "../../db/schema";
import type { Env } from "../../schemas/env";
import type { MaintenancePreActionFailureStep } from "../../schemas/maintenance/announcements";
import type { MaintenancePreActionNotification } from "../../schemas/maintenance/pre-action-notifications";
import { PassportLoginResponseSchema } from "../../schemas/maintenance/pre-action";
import { executeHostCommand } from "../vps/host-command-executor";
import { notifyMaintenancePreAction } from "./notification";

class PreActionExecutionError extends Error {
  readonly step: MaintenancePreActionFailureStep;

  constructor(step: MaintenancePreActionFailureStep, message: string) {
    super(message);
    this.name = "PreActionExecutionError";
    this.step = step;
  }
}

export async function runDueMaintenancePreActions(env: Env, now: Date = new Date()): Promise<void> {
  const nowIso = now.toISOString();
  const interrupted = await failInterruptedMaintenancePreActions(env.DB, nowIso);
  const missed = await failMissedMaintenancePreActions(env.DB, nowIso);
  await Promise.all([
    ...interrupted.map((announcement) =>
      notifyPreActionFailure(
        env,
        announcement,
        [],
        "interrupted",
        "Maintenance pre-action was interrupted before completion."
      )
    ),
    ...missed.map((announcement) =>
      notifyPreActionFailure(
        env,
        announcement,
        [],
        "missed",
        "Maintenance started before its pre-action could run."
      )
    )
  ]);
  await runClaimedMaintenancePreAction(env, nowIso);
}

async function runClaimedMaintenancePreAction(env: Env, nowIso: string): Promise<void> {
  const claim = await claimDueMaintenancePreAction(env.DB, nowIso);
  if (claim === null) return;

  let hostNames: string[] = [];
  try {
    const hosts = await listArkHosts(env);
    if (hosts.length === 0) {
      throw new PreActionExecutionError(
        "host_inventory",
        "No enabled ArkHost hosts were available for restart."
      );
    }
    hostNames = hosts.map((host) => host.name);
    await notifyPreActionBestEffort(env, {
      type: "pre_action_started",
      ...notificationContext(claim, hostNames)
    });
    const token = await loginToArkHostPassport(env);
    await disableGameLogin(token);

    const hostResults = await Promise.all(
      hosts.map((host) => restartArkHost(env, claim.news_id, host))
    );
    if (hostResults.some((succeeded) => !succeeded)) {
      throw new PreActionExecutionError("ssh", "One or more ArkHost restart commands failed.");
    }

    await completeMaintenancePreAction(env.DB, claim.news_id, new Date().toISOString());
    await notifyPreActionBestEffort(env, {
      type: "pre_action_terminal",
      ...notificationContext(claim, hostNames),
      outcome: "completed",
      failureStep: null,
      errorMessage: null
    });
    console.info("Maintenance pre-action completed", {
      newsId: claim.news_id,
      hostCount: hosts.length
    });
  } catch (error) {
    const failure = normalizeFailure(error);
    await failMaintenancePreAction(
      env.DB,
      claim.news_id,
      new Date().toISOString(),
      failure.step,
      failure.message
    );
    await notifyPreActionFailure(env, claim, hostNames, failure.step, failure.message);
    console.error("Maintenance pre-action failed", {
      newsId: claim.news_id,
      step: failure.step,
      error: failure.message
    });
  }
}

function notificationContext(
  announcement: ArknightsMaintenanceAnnouncementRow,
  hostNames: string[]
) {
  return {
    newsId: announcement.news_id,
    title: announcement.title,
    maintenanceStart: announcement.maintenance_start,
    hostNames
  };
}

async function notifyPreActionFailure(
  env: Env,
  announcement: ArknightsMaintenanceAnnouncementRow,
  hostNames: string[],
  failureStep: MaintenancePreActionFailureStep,
  errorMessage: string
): Promise<void> {
  await notifyPreActionBestEffort(env, {
    type: "pre_action_terminal",
    ...notificationContext(announcement, hostNames),
    outcome: "failed",
    failureStep,
    errorMessage
  });
}

async function notifyPreActionBestEffort(
  env: Env,
  event: MaintenancePreActionNotification
): Promise<void> {
  try {
    await notifyMaintenancePreAction(env, event);
  } catch (error) {
    console.error("Maintenance pre-action notification failed", {
      newsId: event.newsId,
      eventType: event.type,
      outcome: event.type === "pre_action_terminal" ? event.outcome : null,
      error: error instanceof Error ? error.message : "notification failed"
    });
  }
}

async function loginToArkHostPassport(env: Env): Promise<string> {
  let response: Response;
  try {
    response = await fetch(MAINTENANCE_PRE_ACTION_LOGIN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: env.ARKHOST_PASSPORT_EMAIL,
        password: env.ARKHOST_PASSPORT_PASSWORD
      })
    });
  } catch {
    throw new PreActionExecutionError("auth", "Passport login request failed.");
  }
  if (!response.ok) {
    throw new PreActionExecutionError(
      "auth",
      `Passport login failed with status ${response.status}.`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new PreActionExecutionError("auth", "Passport login returned invalid JSON.");
  }
  const validation = v.safeParse(PassportLoginResponseSchema, payload);
  if (!validation.success) {
    throw new PreActionExecutionError("auth", "Passport login returned an invalid response.");
  }
  return validation.output.data.token;
}

async function disableGameLogin(token: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(MAINTENANCE_PRE_ACTION_CONFIG_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ allowGameLogin: false })
    });
  } catch {
    throw new PreActionExecutionError("config", "Game login configuration request failed.");
  }
  if (!response.ok) {
    throw new PreActionExecutionError(
      "config",
      `Game login configuration failed with status ${response.status}.`
    );
  }
}

async function listArkHosts(env: Env): Promise<VpsHostRecord[]> {
  try {
    return await new VpsHostRepository(env.DB).listEnabledByRole("arkhost");
  } catch {
    throw new PreActionExecutionError("host_inventory", "Unable to load ArkHost inventory.");
  }
}

async function restartArkHost(env: Env, newsId: string, host: VpsHostRecord): Promise<boolean> {
  let runId: number | null = null;
  try {
    runId = await createMaintenanceHostRun(env.DB, newsId, host, new Date().toISOString());
    const result = await executeHostCommand(env, {
      hostId: host.id,
      command: MAINTENANCE_PRE_ACTION_RESTART_COMMAND,
      timeoutMs: MAINTENANCE_PRE_ACTION_SSH_TIMEOUT_MS
    });
    await finishMaintenanceHostRun(env.DB, runId, result, new Date().toISOString());
    return result.success;
  } catch {
    if (runId !== null) {
      await failMaintenanceHostRun(
        env.DB,
        runId,
        "ArkHost restart execution failed.",
        new Date().toISOString()
      );
    }
    return false;
  }
}

function normalizeFailure(error: unknown): PreActionExecutionError {
  if (error instanceof PreActionExecutionError) return error;
  return new PreActionExecutionError("ssh", "Maintenance pre-action execution failed.");
}
