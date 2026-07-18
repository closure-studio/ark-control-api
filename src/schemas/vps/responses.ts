import * as v from "valibot";

import { GcpOperationResultSchema } from "../gcp/operations";
import { ExecuteHostCommandResultSchema } from "./ssh-command";
import { VpsResourceSchema } from "./hosts";

export const VpsResponseSchema = v.object({
  vps: VpsResourceSchema
});

export const VpsDeleteResponseSchema = v.object({
  id: v.number(),
  name: v.string(),
  deleted: v.literal(true)
});

export const VpsVerifyResponseSchema = v.object({
  result: ExecuteHostCommandResultSchema
});

export const VpsProvisionResponseSchema = v.object({
  vps: VpsResourceSchema,
  operation: GcpOperationResultSchema
});

export type VpsResponse = v.InferOutput<typeof VpsResponseSchema>;
export type VpsDeleteResponse = v.InferOutput<typeof VpsDeleteResponseSchema>;
export type VpsVerifyResponse = v.InferOutput<typeof VpsVerifyResponseSchema>;
export type VpsProvisionResponse = v.InferOutput<typeof VpsProvisionResponseSchema>;
