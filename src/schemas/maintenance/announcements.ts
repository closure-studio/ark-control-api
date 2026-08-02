import * as v from "valibot";

export const NewsIdSchema = v.pipe(v.string(), v.regex(/^\d+$/));

export const NewsLinkSchema = v.object({
  id: NewsIdSchema,
  url: v.pipe(v.string(), v.url())
});

export const MaintenanceNewsListItemSchema = v.object({
  cid: NewsIdSchema
});

export const MaintenanceNewsListResponseSchema = v.object({
  code: v.literal(0),
  data: v.object({
    list: v.array(MaintenanceNewsListItemSchema),
    end: v.boolean()
  })
});

export const NewsDetailSchema = v.object({
  id: NewsIdSchema,
  url: v.pipe(v.string(), v.url()),
  title: v.string(),
  content: v.string()
});

export const MaintenanceTimeSchema = v.object({
  start: v.nullable(v.string()),
  end: v.nullable(v.string()),
  raw: v.nullable(v.string())
});

export const ClassificationStatusSchema = v.picklist([
  "maintenance",
  "not_maintenance",
  "uncertain"
]);

export const ClassificationResultSchema = v.object({
  status: ClassificationStatusSchema,
  isMaintenance: v.boolean(),
  reason: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  summary: v.string(),
  maintenanceStart: v.nullable(v.string()),
  maintenanceEnd: v.nullable(v.string()),
  confidence: v.exactOptional(v.number())
});

export const MaintenanceProcessingStateSchema = v.picklist(["processing", "completed", "failed"]);

export const MaintenancePreActionStateSchema = v.picklist([
  "pending",
  "processing",
  "completed",
  "failed",
  "unschedulable"
]);

export const MaintenancePreActionFailureStepSchema = v.picklist([
  "schedule",
  "auth",
  "config",
  "host_inventory",
  "ssh",
  "missed",
  "interrupted"
]);

export const MaintenanceAnnouncementClassificationSchema = v.object({
  title: v.string(),
  isMaintenance: v.boolean(),
  maintenanceStart: v.nullable(v.string()),
  maintenanceEnd: v.nullable(v.string()),
  maintenanceStartAt: v.nullable(v.pipe(v.string(), v.isoTimestamp())),
  preActionAt: v.nullable(v.pipe(v.string(), v.isoTimestamp())),
  preActionState: v.picklist(["pending", "unschedulable"]),
  preActionFailureStep: v.nullable(v.literal("schedule")),
  preActionErrorMessage: v.nullable(v.string())
});

export const MaintenancePreActionScheduleSchema = v.object({
  maintenanceStartAt: v.pipe(v.string(), v.isoTimestamp()),
  preActionAt: v.pipe(v.string(), v.isoTimestamp())
});

export const MaintenanceNotificationChannelSchema = v.literal("qqbot");

export const MaintenanceAnnouncementOutcomeSchema = v.object({
  processingState: v.picklist(["completed", "failed"]),
  processedAt: v.pipe(v.string(), v.isoTimestamp()),
  title: v.string(),
  isMaintenance: v.boolean(),
  maintenanceStart: v.nullable(v.string()),
  maintenanceEnd: v.nullable(v.string()),
  notified: v.boolean(),
  errorMessage: v.nullable(v.string())
});

export const MaintenanceNotificationResultSchema = v.object({
  notified: v.boolean(),
  notifyChannel: v.nullable(MaintenanceNotificationChannelSchema),
  notifyError: v.nullable(v.string())
});

export type NewsId = v.InferOutput<typeof NewsIdSchema>;
export type NewsLink = v.InferOutput<typeof NewsLinkSchema>;
export type MaintenanceNewsListItem = v.InferOutput<typeof MaintenanceNewsListItemSchema>;
export type MaintenanceNewsListResponse = v.InferOutput<typeof MaintenanceNewsListResponseSchema>;
export type NewsDetail = v.InferOutput<typeof NewsDetailSchema>;
export type MaintenanceTime = v.InferOutput<typeof MaintenanceTimeSchema>;
export type ClassificationStatus = v.InferOutput<typeof ClassificationStatusSchema>;
export type ClassificationResult = v.InferOutput<typeof ClassificationResultSchema>;
export type MaintenanceProcessingState = v.InferOutput<typeof MaintenanceProcessingStateSchema>;
export type MaintenancePreActionState = v.InferOutput<typeof MaintenancePreActionStateSchema>;
export type MaintenancePreActionFailureStep = v.InferOutput<
  typeof MaintenancePreActionFailureStepSchema
>;
export type MaintenanceAnnouncementClassification = v.InferOutput<
  typeof MaintenanceAnnouncementClassificationSchema
>;
export type MaintenancePreActionSchedule = v.InferOutput<typeof MaintenancePreActionScheduleSchema>;
export type MaintenanceAnnouncementOutcome = v.InferOutput<
  typeof MaintenanceAnnouncementOutcomeSchema
>;
export type MaintenanceNotificationResult = v.InferOutput<
  typeof MaintenanceNotificationResultSchema
>;
