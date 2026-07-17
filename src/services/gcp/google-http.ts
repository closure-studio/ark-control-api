import * as v from "valibot";
import { GoogleApiError } from "../../errors/gcp";
import { GoogleErrorResponseSchema } from "../../schemas/gcp/auth";

function googleErrorDetails(body: unknown): {
  message?: string;
  status?: string;
} {
  const result = v.safeParse(GoogleErrorResponseSchema, body);
  if (!result.success) {
    return {};
  }
  const error = result.output.error;
  return {
    ...(result.output.message ? { message: result.output.message } : {}),
    ...(typeof error === "object" && error?.message ? { message: error.message } : {}),
    ...(typeof error === "object" && error?.status ? { status: error.status } : {})
  };
}

export async function requestGoogleJson<TSchema extends v.GenericSchema>(
  fetcher: typeof fetch,
  url: string,
  accessToken: string,
  responseSchema: TSchema,
  init: RequestInit = {}
): Promise<v.InferOutput<TSchema>> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetcher(url, {
    ...init,
    headers
  });
  const textPromise = response.clone().text();
  const body = await response.json().catch(() => undefined);
  const text = await textPromise;

  if (!response.ok) {
    const details = googleErrorDetails(body);
    throw new GoogleApiError(
      details.message ?? (text || "Google API request failed."),
      response.status,
      details.status
    );
  }

  const result = v.safeParse(responseSchema, body);
  if (!result.success) {
    throw new GoogleApiError("Google API returned an invalid response.", 502);
  }
  return result.output;
}
