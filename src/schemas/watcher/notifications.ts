import * as v from "valibot";

import { TerminalHostRunStatusSchema } from "./status";

const NotifyPipelineStartedInputEntries = {
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
  "pipeline_started",
  "helper_deploy_terminal"
]);

export const NotifyPipelineStartedInputSchema = v.object(
  NotifyPipelineStartedInputEntries
);

export const NotifyHelperDeployTerminalInputSchema = v.object(
  NotifyHelperDeployTerminalInputEntries
);

export const PipelineStartedNotificationSchema = v.object({
  type: v.literal("pipeline_started"),
  ...NotifyPipelineStartedInputEntries
});

export const HelperDeployTerminalNotificationSchema = v.object({
  type: v.literal("helper_deploy_terminal"),
  ...NotifyHelperDeployTerminalInputEntries
});

export const NotificationEventSchema = v.variant("type", [
  PipelineStartedNotificationSchema,
  HelperDeployTerminalNotificationSchema
]);

export const NotificationMessageSchema = v.object({
  eventType: NotificationEventTypeSchema,
  message: v.string()
});

export type NotificationEventType = v.InferOutput<typeof NotificationEventTypeSchema>;
export type NotifyPipelineStartedInput = v.InferOutput<
  typeof NotifyPipelineStartedInputSchema
>;
export type NotifyHelperDeployTerminalInput = v.InferOutput<
  typeof NotifyHelperDeployTerminalInputSchema
>;
export type PipelineStartedNotification = v.InferOutput<
  typeof PipelineStartedNotificationSchema
>;
export type HelperDeployTerminalNotification = v.InferOutput<
  typeof HelperDeployTerminalNotificationSchema
>;
export type NotificationEvent = v.InferOutput<typeof NotificationEventSchema>;
export type NotificationMessage = v.InferOutput<typeof NotificationMessageSchema>;
