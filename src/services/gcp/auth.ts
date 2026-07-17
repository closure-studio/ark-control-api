import type { GcpAccountRow } from "../../db/schema";
import { GoogleApiError } from "../../errors/gcp";
import type { Env } from "../../types/env";
import * as v from "valibot";
import {
  GoogleErrorResponseSchema,
  ServiceAccountTokenResponseSchema,
  StsTokenResponseSchema
} from "../../schemas/gcp/auth";
import { issueOidcToken } from "../oidc";

export type GcpAuthOptions = {
  fetch?: typeof fetch;
};

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const STS_TOKEN_URL = "https://sts.googleapis.com/v1/token";
const JSON_HEADERS = { "content-type": "application/json" };

function errorDescription(json: unknown, fallback: string): string {
  const result = v.safeParse(GoogleErrorResponseSchema, json);
  if (!result.success) {
    return fallback;
  }
  const description = result.output.error_description;
  if (description) {
    return description;
  }
  const error = result.output.error;
  if (typeof error === "string" && error) {
    return error;
  }
  const nestedMessage = typeof error === "object" ? error.message : undefined;
  if (nestedMessage) {
    return nestedMessage;
  }
  return fallback;
}

export async function fetchGoogleAccessToken(
  env: Env,
  account: GcpAccountRow,
  options: GcpAuthOptions = {}
): Promise<string> {
  const fetcher = options.fetch ?? fetch;
  const oidcToken = await issueOidcToken(env, {
    audience: account.workload_identity_provider
  });

  const stsBody = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    audience: account.workload_identity_provider,
    scope: GOOGLE_SCOPE,
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    subject_token: oidcToken.id_token
  });

  const stsResponse = await fetcher(STS_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: stsBody.toString()
  });
  const stsJson = await stsResponse.json().catch(() => undefined);

  if (!stsResponse.ok) {
    throw new GoogleApiError(
      `Google STS token exchange failed: ${errorDescription(stsJson, "Unknown error")}`,
      stsResponse.status
    );
  }

  const stsResult = v.safeParse(StsTokenResponseSchema, stsJson);
  if (!stsResult.success) {
    throw new GoogleApiError(
      "Google STS token exchange failed: missing access_token",
      stsResponse.status
    );
  }
  const accessToken = stsResult.output.access_token;

  const serviceAccountUrl =
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
    `${encodeURIComponent(account.service_account_email)}:generateAccessToken`;
  const serviceAccountResponse = await fetcher(serviceAccountUrl, {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ scope: [GOOGLE_SCOPE] })
  });
  const serviceAccountJson = await serviceAccountResponse.json().catch(() => undefined);

  if (!serviceAccountResponse.ok) {
    throw new GoogleApiError(
      `Google service account impersonation failed: ${errorDescription(
        serviceAccountJson,
        "Unknown error"
      )}`,
      serviceAccountResponse.status
    );
  }

  const tokenResult = v.safeParse(ServiceAccountTokenResponseSchema, serviceAccountJson);
  if (!tokenResult.success) {
    throw new GoogleApiError(
      "Google service account impersonation failed: missing accessToken",
      serviceAccountResponse.status
    );
  }

  return tokenResult.output.accessToken;
}
