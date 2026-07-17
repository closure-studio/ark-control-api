import * as v from "valibot";
import { objectSchema, recordSchema } from "../object";

const ComputeAccessConfigSchema = objectSchema({
  natIP: v.exactOptional(v.string())
});

const ComputeNetworkInterfaceSchema = objectSchema({
  networkIP: v.exactOptional(v.string()),
  accessConfigs: v.exactOptional(v.array(ComputeAccessConfigSchema))
});

export const ComputeInstanceSchema = objectSchema({
  name: v.exactOptional(v.string()),
  status: v.exactOptional(v.string()),
  machineType: v.exactOptional(v.string()),
  networkInterfaces: v.exactOptional(v.array(ComputeNetworkInterfaceSchema)),
  labels: v.exactOptional(recordSchema(v.string()))
});

const AggregatedScopedListSchema = objectSchema({
  instances: v.exactOptional(v.array(ComputeInstanceSchema))
});

export const AggregatedInstancesResponseSchema = objectSchema({
  items: v.exactOptional(recordSchema(AggregatedScopedListSchema)),
  nextPageToken: v.exactOptional(v.string())
});

const ComputeOperationErrorItemSchema = objectSchema({
  code: v.exactOptional(v.string()),
  message: v.exactOptional(v.string())
});

const ComputeOperationErrorSchema = objectSchema({
  errors: v.exactOptional(v.array(ComputeOperationErrorItemSchema))
});

export const ComputeOperationResponseSchema = objectSchema({
  name: v.exactOptional(v.string()),
  status: v.exactOptional(v.string()),
  error: v.exactOptional(ComputeOperationErrorSchema)
});

export type ComputeInstance = v.InferOutput<typeof ComputeInstanceSchema>;
export type ComputeOperationResponse = v.InferOutput<typeof ComputeOperationResponseSchema>;
