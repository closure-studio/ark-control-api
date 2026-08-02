import * as v from "valibot";

import { OIDC_JWT_ALGORITHM, OIDC_JWT_TYPE, OIDC_PUBLIC_KEY_USE } from "../../constants/oidc";

export const OidcDiscoveryMetadataSchema = v.object({
  issuer: v.string(),
  jwks_uri: v.string(),
  response_types_supported: v.array(v.string()),
  subject_types_supported: v.array(v.string()),
  id_token_signing_alg_values_supported: v.array(v.string()),
  claims_supported: v.array(v.string())
});

export const OidcJsonWebKeySchema = v.object({
  alg: v.literal(OIDC_JWT_ALGORITHM),
  e: v.string(),
  kid: v.string(),
  kty: v.string(),
  n: v.string(),
  use: v.literal(OIDC_PUBLIC_KEY_USE)
});

export const JsonWebKeySetSchema = v.object({
  keys: v.array(OidcJsonWebKeySchema)
});

export const OidcJwtHeaderSchema = v.object({
  alg: v.literal(OIDC_JWT_ALGORITHM),
  kid: v.string(),
  typ: v.literal(OIDC_JWT_TYPE)
});

export const OidcJwtPayloadSchema = v.object({
  iss: v.string(),
  aud: v.string(),
  sub: v.string(),
  purpose: v.string(),
  iat: v.number(),
  nbf: v.number(),
  exp: v.number(),
  jti: v.string()
});

export const OidcTokenSuccessResponseSchema = v.object({
  version: v.literal(1),
  success: v.literal(true),
  token_type: v.string(),
  id_token: v.string(),
  expiration_time: v.number()
});

export const OidcTokenFailureResponseSchema = v.object({
  version: v.literal(1),
  success: v.literal(false),
  code: v.string(),
  message: v.string()
});

export const IssueOidcTokenOptionsSchema = v.object({
  audience: v.string(),
  now: v.exactOptional(v.date()),
  jti: v.exactOptional(v.string())
});

export type OidcDiscoveryMetadata = v.InferOutput<typeof OidcDiscoveryMetadataSchema>;
export type OidcJsonWebKey = v.InferOutput<typeof OidcJsonWebKeySchema>;
export type JsonWebKeySet = v.InferOutput<typeof JsonWebKeySetSchema>;
export type OidcJwtHeader = v.InferOutput<typeof OidcJwtHeaderSchema>;
export type OidcJwtPayload = v.InferOutput<typeof OidcJwtPayloadSchema>;
export type OidcTokenSuccessResponse = v.InferOutput<typeof OidcTokenSuccessResponseSchema>;
export type OidcTokenFailureResponse = v.InferOutput<typeof OidcTokenFailureResponseSchema>;
export type IssueOidcTokenOptions = v.InferOutput<typeof IssueOidcTokenOptionsSchema>;
