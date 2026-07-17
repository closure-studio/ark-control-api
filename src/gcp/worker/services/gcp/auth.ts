import type { GcpAccountRow } from "../../model/schema/gcp";
import type { Env } from "../../model/schema/worker";
import { issueOidcToken } from "../../../../controller/oidc";
import { GoogleApiError } from "./errors";

export type GcpAuthOptions = {
  fetch?: typeof fetch;
};

type StsTokenResponse = {
  access_token?: string;
};

type ServiceAccountTokenResponse = {
  accessToken?: string;
};

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const STS_TOKEN_URL = "https://sts.googleapis.com/v1/token";
const JSON_HEADERS = { "content-type": "application/json" };

function errorDescription(json: unknown, fallback: string): string {
  if (typeof json !== "object" || json === null) {
    return fallback;
  }
  const body = json as Record<string, unknown>;
  if (typeof body.error_description === "string") {
    return body.error_description;
  }
  if (typeof body.error === "string") {
    return body.error;
  }
  if (typeof body.error === "object" && body.error !== null) {
    const nested = body.error as Record<string, unknown>;
    if (typeof nested.message === "string") {
      return nested.message;
    }
  }
  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
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
  const stsJson = await readJson(stsResponse);

  if (!stsResponse.ok) {
    throw new GoogleApiError(
      `Google STS token exchange failed: ${errorDescription(stsJson, "Unknown error")}`,
      stsResponse.status
    );
  }

  const stsToken = stsJson as StsTokenResponse;
  if (typeof stsToken.access_token !== "string") {
    throw new GoogleApiError(
      "Google STS token exchange failed: missing access_token",
      stsResponse.status
    );
  }

  const serviceAccountUrl =
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
    `${encodeURIComponent(account.service_account_email)}:generateAccessToken`;
  const serviceAccountResponse = await fetcher(serviceAccountUrl, {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      Authorization: `Bearer ${stsToken.access_token}`
    },
    body: JSON.stringify({ scope: [GOOGLE_SCOPE] })
  });
  const serviceAccountJson = await readJson(serviceAccountResponse);

  if (!serviceAccountResponse.ok) {
    throw new GoogleApiError(
      `Google service account impersonation failed: ${errorDescription(
        serviceAccountJson,
        "Unknown error"
      )}`,
      serviceAccountResponse.status
    );
  }

  const serviceAccountToken = serviceAccountJson as ServiceAccountTokenResponse;
  if (typeof serviceAccountToken.accessToken !== "string") {
    throw new GoogleApiError(
      "Google service account impersonation failed: missing accessToken",
      serviceAccountResponse.status
    );
  }

  return serviceAccountToken.accessToken;
}
