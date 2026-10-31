import * as v from "valibot";

import { CompatibilityStatusSchema } from "./compatibility";
import { TerminalHostRunStatusSchema } from "./status";

const NotifyDeploymentStartedInputEntries = {
  apkFilename: v.string()
};

const NotifyHelperDeployTerminalInputEntries = {
  hostId: v.number(),
  hostName: v.string(),
  apkFilename: v.string(),
  status: TerminalHostRunStatusSchema,
  result: v.string()
};

export const NotificationEventTypeSchema = v.picklist([
  "deployment_started",
  "helper_deploy_terminal",
  "compatibility"
]);

export const NotifyDeploymentStartedInputSchema = v.object(NotifyDeploymentStartedInputEntries);

export const NotifyHelperDeployTerminalInputSchema = v.object(
  NotifyHelperDeployTerminalInputEntries
);

export const DeploymentStartedNotificationSchema = v.object({
  type: v.literal("deployment_started"),
  ...NotifyDeploymentStartedInputEntries
});

export const HelperDeployTerminalNotificationSchema = v.object({
  type: v.literal("helper_deploy_terminal"),
  ...NotifyHelperDeployTerminalInputEntries
});

export const CompatibilityNotificationSchema = v.object({
  type: v.literal("compatibility"),
  apkFilename: v.string(),
  jobId: v.string(),
  status: CompatibilityStatusSchema,
  reason: v.string()
});

export const NotificationEventSchema = v.variant("type", [
  DeploymentStartedNotificationSchema,
  HelperDeployTerminalNotificationSchema,
  CompatibilityNotificationSchema
]);

export const NotificationMessageSchema = v.object({
  eventType: NotificationEventTypeSchema,
  message: v.string()
});

export type NotificationEventType = v.InferOutput<typeof NotificationEventTypeSchema>;
export type NotifyDeploymentStartedInput = v.InferOutput<typeof NotifyDeploymentStartedInputSchema>;
export type NotifyHelperDeployTerminalInput = v.InferOutput<
  typeof NotifyHelperDeployTerminalInputSchema
>;
export type DeploymentStartedNotification = v.InferOutput<
  typeof DeploymentStartedNotificationSchema
>;
export type HelperDeployTerminalNotification = v.InferOutput<
  typeof HelperDeployTerminalNotificationSchema
>;
export type CompatibilityNotification = v.InferOutput<typeof CompatibilityNotificationSchema>;
export type NotificationEvent = v.InferOutput<typeof NotificationEventSchema>;
export type NotificationMessage = v.InferOutput<typeof NotificationMessageSchema>;
