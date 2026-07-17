import * as v from "valibot";

const NestedGoogleErrorSchema = v.object({
  message: v.exactOptional(v.string()),
  status: v.exactOptional(v.string())
});

export const GoogleErrorResponseSchema = v.object({
  error: v.exactOptional(v.union([v.string(), NestedGoogleErrorSchema])),
  error_description: v.exactOptional(v.string()),
  message: v.exactOptional(v.string())
});

export const StsTokenResponseSchema = v.object({
  access_token: v.string()
});

export const ServiceAccountTokenResponseSchema = v.object({
  accessToken: v.string()
});
