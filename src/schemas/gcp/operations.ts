import * as v from "valibot";

export const GcpInstanceLifecycleActionSchema = v.picklist(["start", "stop", "delete"]);
export const GcpOperationActionSchema = v.picklist(["create", "start", "stop", "delete"]);
export const GcpOperationStatusSchema = v.picklist([
  "submitted",
  "succeeded",
  "failed",
  "skipped"
]);

export const GcpInstanceLifecycleTargetSchema = v.object({
  accountId: v.number(),
  projectId: v.string(),
  zone: v.string(),
  instanceName: v.string(),
  status: v.exactOptional(v.string())
});

export const GcpOperationResultSchema = v.object({
  accountId: v.number(),
  projectId: v.string(),
  zone: v.string(),
  instanceName: v.string(),
  action: GcpOperationActionSchema,
  status: GcpOperationStatusSchema,
  message: v.exactOptional(v.string()),
  googleOperationName: v.exactOptional(v.string())
});

export const GcpOperationSchema = v.object({
  id: v.number(),
  batchId: v.string(),
  accountId: v.nullable(v.number()),
  accountName: v.nullable(v.string()),
  projectId: v.string(),
  zone: v.string(),
  instanceName: v.string(),
  action: GcpOperationActionSchema,
  status: GcpOperationStatusSchema,
  message: v.nullable(v.string()),
  googleOperationName: v.nullable(v.string()),
  createdAt: v.string()
});

export type GcpInstanceLifecycleAction = v.InferOutput<
  typeof GcpInstanceLifecycleActionSchema
>;
export type GcpInstanceLifecycleTarget = v.InferOutput<
  typeof GcpInstanceLifecycleTargetSchema
>;
export type GcpOperationResult = v.InferOutput<typeof GcpOperationResultSchema>;
export type GcpOperation = v.InferOutput<typeof GcpOperationSchema>;
