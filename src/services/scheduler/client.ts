import { CONTROL_JOB_NAMES, type ControlJobName } from "../../schemas/scheduler/jobs";

type ControlJobAlarmNamespace = {
  getByName(name: string): {
    fetch(request: Request): Promise<Response>;
  };
};

async function ensureControlJobAlarm(
  namespace: ControlJobAlarmNamespace,
  job: ControlJobName
): Promise<void> {
  const response = await namespace
    .getByName(job)
    .fetch(new Request("https://control-job-alarm.internal/ensure", { method: "POST" }));
  if (!response.ok) {
    throw new Error(`Unable to ensure ${job} alarm: ${response.status}.`);
  }
}

export async function ensureControlJobAlarms(namespace: ControlJobAlarmNamespace): Promise<void> {
  const results = await Promise.allSettled(
    CONTROL_JOB_NAMES.map((job) => ensureControlJobAlarm(namespace, job))
  );
  const failures = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return [];
    return [{ job: CONTROL_JOB_NAMES[index], reason: formatError(result.reason) }];
  });
  if (failures.length === 0) return;
  console.error("Control job alarm watchdog failed", { failures });
  throw new Error("One or more control job alarms could not be ensured.");
}

export async function refreshMaintenancePreActionAlarm(
  namespace: ControlJobAlarmNamespace
): Promise<void> {
  await ensureControlJobAlarm(namespace, "maintenance-pre-action");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown alarm error";
}
