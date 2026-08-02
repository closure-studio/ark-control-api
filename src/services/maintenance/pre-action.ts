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
import type { Env } from "../../schemas/env";
import type { MaintenancePreActionFailureStep } from "../../schemas/maintenance/announcements";
import { PassportLoginResponseSchema } from "../../schemas/maintenance/pre-action";
import { executeHostCommand } from "../vps/host-command-executor";

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
  await failInterruptedMaintenancePreActions(env.DB, nowIso);
  await failMissedMaintenancePreActions(env.DB, nowIso);
  await runClaimedMaintenancePreAction(env, nowIso);
}

async function runClaimedMaintenancePreAction(env: Env, nowIso: string): Promise<void> {
  const claim = await claimDueMaintenancePreAction(env.DB, nowIso);
  if (claim === null) return;

  try {
    const hosts = await listArkHosts(env);
    if (hosts.length === 0) {
      throw new PreActionExecutionError(
        "host_inventory",
        "No enabled ArkHost hosts were available for restart."
      );
    }
    const token = await loginToArkHostPassport(env);
    await disableGameLogin(token);

    const hostResults = await Promise.all(
      hosts.map((host) => restartArkHost(env, claim.news_id, host))
    );
    if (hostResults.some((succeeded) => !succeeded)) {
      throw new PreActionExecutionError("ssh", "One or more ArkHost restart commands failed.");
    }

    await completeMaintenancePreAction(env.DB, claim.news_id, new Date().toISOString());
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
    console.error("Maintenance pre-action failed", {
      newsId: claim.news_id,
      step: failure.step,
      error: failure.message
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
