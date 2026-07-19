import * as v from "valibot";

import { GcpAccountSchema } from "./accounts";
import { GcpOperationSchema } from "./operations";

export const GcpAccountResponseSchema = v.object({
  account: GcpAccountSchema
});

export const GcpAccountsResponseSchema = v.object({
  accounts: v.array(GcpAccountSchema)
});

export const GcpAccountDeleteResponseSchema = v.object({
  deleted: v.literal(true)
});

export const GcpAccountUpsertResultSchema = v.object({
  account: GcpAccountSchema,
  created: v.boolean()
});

export const GcpOperationsResponseSchema = v.object({
  operations: v.array(GcpOperationSchema),
  pagination: v.object({
    limit: v.number(),
    offset: v.number(),
    count: v.number(),
    total: v.number()
  })
});

export type GcpAccountResponse = v.InferOutput<typeof GcpAccountResponseSchema>;
export type GcpAccountsResponse = v.InferOutput<typeof GcpAccountsResponseSchema>;
export type GcpAccountDeleteResponse = v.InferOutput<typeof GcpAccountDeleteResponseSchema>;
export type GcpAccountUpsertResult = v.InferOutput<typeof GcpAccountUpsertResultSchema>;
export type GcpOperationsResponse = v.InferOutput<typeof GcpOperationsResponseSchema>;
