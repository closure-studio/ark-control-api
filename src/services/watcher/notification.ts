import type { Env } from "../../schemas/env";
import type {
  NotificationEvent,
  NotifyHelperDeployTerminalInput,
  NotifyPipelineStartedInput
} from "../../schemas/watcher/notifications";
import { buildNotificationMessage } from "../../utils/watcher/notification-message";
import { sendQqBotAutoMessage } from "../notifications/qq-bot";

export interface NotificationRuntime {
  fetcher?: typeof fetch;
  logger?: Pick<Console, "error">;
}

function parseQqBotUid(value: string | undefined): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("QQBOT_UID is required");
  }

  const uid = Number(value);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new Error("QQBOT_UID must be a positive integer");
  }

  return uid;
}

function parseLogUid(value: string | undefined): number | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const uid = Number(value);
  return Number.isInteger(uid) && uid > 0 ? uid : null;
}

function redactConfiguredToken(message: string, token: string | undefined): string {
  if (typeof token !== "string") {
    return message;
  }

  const tokenValues = [token, token.trim()].filter(
    (value, index, values) => value.length > 0 && values.indexOf(value) === index,
  );
  return tokenValues.reduce(
    (redactedMessage, tokenValue) => redactedMessage.split(tokenValue).join("[redacted]"),
    message,
  );
}

function getErrorMessage(error: unknown, token: string | undefined): string {
  const message = error instanceof Error ? error.message : "notification failed";
  return redactConfiguredToken(message, token);
}

async function notifyEvent(env: Env, event: NotificationEvent, runtime: NotificationRuntime = {}): Promise<void> {
  const logger = runtime.logger ?? console;
  const notification = buildNotificationMessage(event);

  try {
    if (typeof env.QQBOT_TOKEN !== "string" || env.QQBOT_TOKEN.trim().length === 0) {
      throw new Error("QQBOT_TOKEN is required");
    }

    await sendQqBotAutoMessage({
      token: env.QQBOT_TOKEN,
      uid: parseQqBotUid(env.QQBOT_UID),
      msg: notification.message,
      ...(runtime.fetcher !== undefined ? { fetcher: runtime.fetcher } : {})
    });
  } catch (error) {
    logger.error("notification failed", {
      eventType: notification.eventType,
      uid: parseLogUid(env.QQBOT_UID),
      error: getErrorMessage(error, env.QQBOT_TOKEN),
    });
  }
}

export async function notifyPipelineStarted(
  env: Env,
  input: NotifyPipelineStartedInput,
  runtime: NotificationRuntime = {},
): Promise<void> {
  await notifyEvent(
    env,
    {
      type: "pipeline_started",
      apkFilename: input.apkFilename,
    },
    runtime,
  );
}

export async function notifyHelperDeployTerminal(
  env: Env,
  input: NotifyHelperDeployTerminalInput,
  runtime: NotificationRuntime = {},
): Promise<void> {
  await notifyEvent(
    env,
    {
      type: "helper_deploy_terminal",
      hostId: input.hostId,
      hostName: input.hostName,
      apkFilename: input.apkFilename,
      status: input.status,
      result: input.result,
    },
    runtime,
  );
}
