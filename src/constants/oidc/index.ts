export const OIDC_JWT_ALGORITHM = "RS256";
export const OIDC_JWT_TYPE = "JWT";
export const OIDC_PUBLIC_KEY_USE = "sig";
export const OIDC_PURPOSE_CLAIM_NAME = "purpose";
export const OIDC_PURPOSE_CLAIM_VALUE = "gcp-wif";
export const GOOGLE_JWT_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:jwt";
export const DEFAULT_OIDC_TOKEN_TTL_SECONDS = 300;
export const MAX_OIDC_TOKEN_TTL_SECONDS = 3600;
export const OIDC_METADATA_CACHE_CONTROL = "public, max-age=300";
export const OIDC_TOKEN_CACHE_CONTROL = "no-store";

export const OIDC_RESPONSE_TYPES_SUPPORTED = ["id_token"] as const;
export const OIDC_SUBJECT_TYPES_SUPPORTED = ["public"] as const;
export const OIDC_SIGNING_ALGORITHMS_SUPPORTED = [OIDC_JWT_ALGORITHM] as const;
export const OIDC_CLAIMS_SUPPORTED = [
  "iss",
  "sub",
  "aud",
  "exp",
  "iat",
  "nbf",
  "jti",
  OIDC_PURPOSE_CLAIM_NAME
] as const;

export const OIDC_ERROR_CODES = {
  invalidRequest: "invalid_request",
  serverError: "server_error",
  unauthorized: "unauthorized"
} as const;

export const OIDC_ERROR_MESSAGES = {
  invalidRequest: "Invalid request",
  unableToIssueToken: "Unable to issue token",
  unauthorized: "Unauthorized"
} as const;
