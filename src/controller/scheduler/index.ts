import type { Env } from "../../schemas/env";
import { CONTROL_JOB_NAMES, type ControlJobName } from "../../schemas/scheduler/jobs";
import type { SchedulerEnsureResponse } from "../../schemas/scheduler/responses";
import { ensureControlJobAlarms } from "../../services/scheduler/client";

export async function ensureSchedulerAlarms(env: Env): Promise<SchedulerEnsureResponse> {
  await ensureControlJobAlarms(env.CONTROL_JOB_ALARMS);
  const ensuredJobs: ControlJobName[] = [...CONTROL_JOB_NAMES];
  return { ensuredJobs };
}
