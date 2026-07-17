import {
  DEFAULT_OIDC_TOKEN_TTL_SECONDS,
  GOOGLE_JWT_TOKEN_TYPE,
  MAX_OIDC_TOKEN_TTL_SECONDS,
  OIDC_CLAIMS_SUPPORTED,
  OIDC_ERROR_CODES,
  OIDC_ERROR_MESSAGES,
  OIDC_JWT_ALGORITHM,
  OIDC_JWT_TYPE,
  OIDC_PURPOSE_CLAIM_VALUE,
  OIDC_RESPONSE_TYPES_SUPPORTED,
  OIDC_SIGNING_ALGORITHMS_SUPPORTED,
  OIDC_SUBJECT_TYPES_SUPPORTED,
} from "./constants";
import type { Env } from "../../env";
import type {
  IssueOidcTokenOptions,
  JsonWebKeySet,
  OidcDiscoveryMetadata,
  OidcJwtPayload,
  OidcTokenFailureResponse,
  OidcTokenSuccessResponse,
} from "./types";
import { exportPublicJwk, importPkcs8PrivateKey, signJwt } from "./jwt";

type RequiredEnvKey =
  | "OIDC_ISSUER"
  | "OIDC_KEY_ID"
  | "OIDC_PRIVATE_KEY_PEM"
  | "OIDC_SUBJECT";

export class OidcConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OidcConfigurationError";
  }
}

const requireConfig = (env: Env, key: RequiredEnvKey): string => {
  const value = env[key]?.trim();
  if (!value) {
    throw new OidcConfigurationError(
      `Missing required OIDC configuration: ${key}`,
    );
  }
  return value;
};

export const canonicalizeIssuer = (issuer: string): string =>
  issuer.trim().replace(/\/+$/g, "");

const requireAudience = (audience: string): string => {
  const value = audience.trim();
  if (!value) {
    throw new OidcConfigurationError("Missing required token audience");
  }
  return value;
};

const parseTokenTtlSeconds = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_OIDC_TOKEN_TTL_SECONDS;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OIDC_TOKEN_TTL_SECONDS;
  }

  return Math.min(Math.floor(parsed), MAX_OIDC_TOKEN_TTL_SECONDS);
};

export const createTokenFailureResponse = (
  code: string,
  message: string,
): OidcTokenFailureResponse => ({
  code,
  message,
  success: false,
  version: 1,
});

export const createGenericTokenFailureResponse = (): OidcTokenFailureResponse =>
  createTokenFailureResponse(
    OIDC_ERROR_CODES.serverError,
    OIDC_ERROR_MESSAGES.unableToIssueToken,
  );

export const createOidcDiscoveryMetadata = (env: Env): OidcDiscoveryMetadata => {
  const issuer = canonicalizeIssuer(requireConfig(env, "OIDC_ISSUER"));

  return {
    claims_supported: OIDC_CLAIMS_SUPPORTED,
    id_token_signing_alg_values_supported: OIDC_SIGNING_ALGORITHMS_SUPPORTED,
    issuer,
    jwks_uri: `${issuer}/jwks.json`,
    response_types_supported: OIDC_RESPONSE_TYPES_SUPPORTED,
    subject_types_supported: OIDC_SUBJECT_TYPES_SUPPORTED,
  };
};

export const createOidcJwks = async (env: Env): Promise<JsonWebKeySet> => {
  const privateKey = await importPkcs8PrivateKey(
    requireConfig(env, "OIDC_PRIVATE_KEY_PEM"),
  );
  const publicJwk = await exportPublicJwk(
    privateKey,
    requireConfig(env, "OIDC_KEY_ID"),
  );

  return {
    keys: [publicJwk],
  };
};

export const issueOidcToken = async (
  env: Env,
  options: IssueOidcTokenOptions,
): Promise<OidcTokenSuccessResponse> => {
  const issuer = canonicalizeIssuer(requireConfig(env, "OIDC_ISSUER"));
  const audience = requireAudience(options.audience);
  const keyId = requireConfig(env, "OIDC_KEY_ID");
  const privateKeyPem = requireConfig(env, "OIDC_PRIVATE_KEY_PEM");
  const subject = requireConfig(env, "OIDC_SUBJECT");
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const ttlSeconds = parseTokenTtlSeconds(env.OIDC_TOKEN_TTL_SECONDS);
  const expiresAt = issuedAt + ttlSeconds;
  const privateKey = await importPkcs8PrivateKey(privateKeyPem);

  const payload: OidcJwtPayload = {
    aud: audience,
    exp: expiresAt,
    iat: issuedAt,
    iss: issuer,
    jti: options.jti ?? crypto.randomUUID(),
    nbf: issuedAt,
    purpose: OIDC_PURPOSE_CLAIM_VALUE,
    sub: subject,
  };

  const idToken = await signJwt(
    {
      alg: OIDC_JWT_ALGORITHM,
      kid: keyId,
      typ: OIDC_JWT_TYPE,
    },
    payload,
    privateKey,
  );

  return {
    expiration_time: expiresAt,
    id_token: idToken,
    success: true,
    token_type: GOOGLE_JWT_TOKEN_TYPE,
    version: 1,
  };
};
