export interface Env {
  OIDC_ISSUER: string;
  OIDC_KEY_ID: string;
  OIDC_PRIVATE_KEY_PEM: string;
  OIDC_SUBJECT: string;
  PUBLIC_TOKEN_BEARER_SECRET: string;
  OIDC_TOKEN_TTL_SECONDS?: string;
}
