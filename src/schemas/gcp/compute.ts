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

export const GcpInstanceSchema = v.object({
  accountId: v.number(),
  accountName: v.string(),
  projectId: v.string(),
  zone: v.string(),
  name: v.string(),
  status: v.string(),
  machineType: v.string(),
  internalIps: v.array(v.string()),
  externalIps: v.array(v.string()),
  labels: v.record(v.string(), v.string())
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

const VPS_SPEC_LIMITS = {
  cpu: { min: 1, max: 64, default: 6 },
  memoryGbPerCpu: { min: 2, max: 8 },
  defaultMemoryGb: 16,
  diskSizeGb: { min: 10, max: 4096, default: 100 }
} as const;

export const ProvisionGcpVpsRequestSchema = v.pipe(
  v.object({
    cpuCount: v.optional(
      v.pipe(
        v.number(),
        v.integer("CPU count must be a whole number."),
        v.minValue(
          VPS_SPEC_LIMITS.cpu.min,
          `CPU count must be at least ${VPS_SPEC_LIMITS.cpu.min}.`
        ),
        v.maxValue(VPS_SPEC_LIMITS.cpu.max, `CPU count must be at most ${VPS_SPEC_LIMITS.cpu.max}.`)
      ),
      VPS_SPEC_LIMITS.cpu.default
    ),
    memoryGb: v.optional(
      v.pipe(v.number(), v.integer("Memory size must be a whole number of GB.")),
      VPS_SPEC_LIMITS.defaultMemoryGb
    ),
    provisioningModel: v.optional(v.picklist(["SPOT", "STANDARD"]), "SPOT"),
    diskSizeGb: v.optional(
      v.pipe(
        v.number(),
        v.integer("Disk size must be a whole number of GB."),
        v.minValue(
          VPS_SPEC_LIMITS.diskSizeGb.min,
          `Disk size must be at least ${VPS_SPEC_LIMITS.diskSizeGb.min} GB.`
        ),
        v.maxValue(
          VPS_SPEC_LIMITS.diskSizeGb.max,
          `Disk size must be at most ${VPS_SPEC_LIMITS.diskSizeGb.max} GB.`
        )
      ),
      VPS_SPEC_LIMITS.diskSizeGb.default
    )
  }),
  v.check(
    ({ cpuCount, memoryGb }) =>
      memoryGb >= cpuCount * VPS_SPEC_LIMITS.memoryGbPerCpu.min &&
      memoryGb <= cpuCount * VPS_SPEC_LIMITS.memoryGbPerCpu.max,
    `Memory must be between ${VPS_SPEC_LIMITS.memoryGbPerCpu.min} GB and ${VPS_SPEC_LIMITS.memoryGbPerCpu.max} GB per vCPU for n4a-custom.`
  )
);

export type ComputeInstance = v.InferOutput<typeof ComputeInstanceSchema>;
export type ComputeOperationResponse = v.InferOutput<typeof ComputeOperationResponseSchema>;
export type GcpInstance = v.InferOutput<typeof GcpInstanceSchema>;
export type ProvisionGcpVpsRequest = v.InferOutput<typeof ProvisionGcpVpsRequestSchema>;
