import * as v from "valibot";

const ComputeAccessConfigSchema = v.object({
  natIP: v.exactOptional(v.string())
});

const ComputeNetworkInterfaceSchema = v.object({
  networkIP: v.exactOptional(v.string()),
  accessConfigs: v.exactOptional(v.array(ComputeAccessConfigSchema))
});

export const ComputeInstanceSchema = v.object({
  name: v.exactOptional(v.string()),
  status: v.exactOptional(v.string()),
  machineType: v.exactOptional(v.string()),
  networkInterfaces: v.exactOptional(v.array(ComputeNetworkInterfaceSchema)),
  labels: v.exactOptional(v.record(v.string(), v.string()))
});

const AggregatedScopedListSchema = v.object({
  instances: v.exactOptional(v.array(ComputeInstanceSchema))
});

export const AggregatedInstancesResponseSchema = v.object({
  items: v.exactOptional(v.record(v.string(), AggregatedScopedListSchema)),
  nextPageToken: v.exactOptional(v.string())
});

const ComputeOperationErrorItemSchema = v.object({
  code: v.exactOptional(v.string()),
  message: v.exactOptional(v.string())
});

const ComputeOperationErrorSchema = v.object({
  errors: v.exactOptional(v.array(ComputeOperationErrorItemSchema))
});

export const ComputeOperationResponseSchema = v.object({
  name: v.exactOptional(v.string()),
  status: v.exactOptional(v.string()),
  error: v.exactOptional(ComputeOperationErrorSchema)
});

export type ComputeInstance = v.InferOutput<typeof ComputeInstanceSchema>;
export type ComputeOperationResponse = v.InferOutput<typeof ComputeOperationResponseSchema>;
