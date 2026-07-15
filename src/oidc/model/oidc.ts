import type {
  OIDC_CLAIMS_SUPPORTED,
  OIDC_RESPONSE_TYPES_SUPPORTED,
  OIDC_SIGNING_ALGORITHMS_SUPPORTED,
  OIDC_SUBJECT_TYPES_SUPPORTED,
} from "../constants/oidc";

export interface OidcDiscoveryMetadata {
  issuer: string;
  jwks_uri: string;
  response_types_supported: typeof OIDC_RESPONSE_TYPES_SUPPORTED;
  subject_types_supported: typeof OIDC_SUBJECT_TYPES_SUPPORTED;
  id_token_signing_alg_values_supported: typeof OIDC_SIGNING_ALGORITHMS_SUPPORTED;
  claims_supported: typeof OIDC_CLAIMS_SUPPORTED;
}

export interface JsonWebKeySet {
  keys: JsonWebKey[];
}

export interface OidcJwtHeader {
  alg: string;
  kid: string;
  typ: string;
}

export interface OidcJwtPayload {
  iss: string;
  aud: string;
  sub: string;
  purpose: string;
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
}

export interface OidcTokenSuccessResponse {
  version: 1;
  success: true;
  token_type: string;
  id_token: string;
  expiration_time: number;
}

export interface OidcTokenFailureResponse {
  version: 1;
  success: false;
  code: string;
  message: string;
}

export type OidcTokenResponse =
  | OidcTokenSuccessResponse
  | OidcTokenFailureResponse;

export interface IssueOidcTokenOptions {
  audience: string;
  now?: Date;
  jti?: string;
}
