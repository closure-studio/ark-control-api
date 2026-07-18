import * as v from "valibot";

import { GcpAccountSchema } from "./accounts";

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

export type GcpAccountResponse = v.InferOutput<typeof GcpAccountResponseSchema>;
export type GcpAccountsResponse = v.InferOutput<typeof GcpAccountsResponseSchema>;
export type GcpAccountDeleteResponse = v.InferOutput<typeof GcpAccountDeleteResponseSchema>;
export type GcpAccountUpsertResult = v.InferOutput<typeof GcpAccountUpsertResultSchema>;
