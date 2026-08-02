import type { Env } from "../../schemas/env";
import type {
  NotificationEvent,
  NotifyDeploymentStartedInput,
  NotifyHelperDeployTerminalInput
} from "../../schemas/apk-delivery/notifications";
import { buildNotificationMessage } from "../../utils/apk-delivery/notification-message";
import { sendQqBotAutoMessage } from "../notifications/qq-bot";

type NotificationRuntime = {
  fetcher?: typeof fetch;
};

async function notifyEvent(
  env: Env,
  event: NotificationEvent,
  runtime: NotificationRuntime = {}
): Promise<void> {
  const notification = buildNotificationMessage(event);
  await sendQqBotAutoMessage(env, notification.message, {
    ...(runtime.fetcher !== undefined ? { fetcher: runtime.fetcher } : {})
  });
}

export async function notifyDeploymentStarted(
  env: Env,
  input: NotifyDeploymentStartedInput,
  runtime: NotificationRuntime = {}
): Promise<void> {
  await notifyEvent(
    env,
    {
      type: "deployment_started",
      apkFilename: input.apkFilename
    },
    runtime
  );
}

export async function notifyHelperDeployTerminal(
  env: Env,
  input: NotifyHelperDeployTerminalInput,
  runtime: NotificationRuntime = {}
): Promise<void> {
  await notifyEvent(
    env,
    {
      type: "helper_deploy_terminal",
      hostId: input.hostId,
      hostName: input.hostName,
      apkFilename: input.apkFilename,
      status: input.status,
      result: input.result
    },
    runtime
  );
}
