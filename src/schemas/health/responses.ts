import * as v from "valibot";

import { OIDC_APP_NAME } from "../../constants/oidc";

export const HealthResponseSchema = v.object({
  ok: v.literal(true),
  service: v.literal("ark-control-api"),
  time: v.string()
});

export const OidcHealthResponseSchema = v.object({
  name: v.literal(OIDC_APP_NAME),
  status: v.literal("ok")
});

export type HealthResponse = v.InferOutput<typeof HealthResponseSchema>;
export type OidcHealthResponse = v.InferOutput<typeof OidcHealthResponseSchema>;
