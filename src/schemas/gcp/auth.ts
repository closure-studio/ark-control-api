import * as v from "valibot";
import { objectSchema } from "../object";

const NestedGoogleErrorSchema = objectSchema({
  message: v.exactOptional(v.string()),
  status: v.exactOptional(v.string())
});

export const GoogleErrorResponseSchema = objectSchema({
  error: v.exactOptional(v.union([v.string(), NestedGoogleErrorSchema])),
  error_description: v.exactOptional(v.string()),
  message: v.exactOptional(v.string())
});

export const StsTokenResponseSchema = objectSchema({
  access_token: v.string()
});

export const ServiceAccountTokenResponseSchema = objectSchema({
  accessToken: v.string()
});
