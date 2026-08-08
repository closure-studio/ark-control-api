import * as v from "valibot";

import { MaintenancePreActionFailureStepSchema } from "./announcements";

const MaintenancePreActionNotificationContextEntries = {
  newsId: v.string(),
  title: v.nullable(v.string()),
  maintenanceStart: v.nullable(v.string()),
  hostNames: v.array(v.string())
};

export const MaintenancePreActionStartedNotificationSchema = v.object({
  type: v.literal("pre_action_started"),
  ...MaintenancePreActionNotificationContextEntries
});

export const MaintenancePreActionTerminalNotificationSchema = v.object({
  type: v.literal("pre_action_terminal"),
  ...MaintenancePreActionNotificationContextEntries,
  outcome: v.picklist(["completed", "failed"]),
  failureStep: v.nullable(MaintenancePreActionFailureStepSchema),
  errorMessage: v.nullable(v.string())
});

export const MaintenancePreActionNotificationSchema = v.variant("type", [
  MaintenancePreActionStartedNotificationSchema,
  MaintenancePreActionTerminalNotificationSchema
]);

export type MaintenancePreActionNotification = v.InferOutput<
  typeof MaintenancePreActionNotificationSchema
>;
