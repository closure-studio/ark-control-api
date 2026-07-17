import { GoogleApiError } from "../../errors/gcp";

export async function requestGoogleJson<T>(
  fetcher: typeof fetch,
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetcher(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined)
    }
  });
  const text = await response.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = body?.error as Record<string, unknown> | undefined;
    const message =
      typeof error?.message === "string"
        ? error.message
        : typeof body?.message === "string"
          ? body.message
          : text || "Google API request failed.";
    const status = typeof error?.status === "string" ? error.status : undefined;
    throw new GoogleApiError(message, response.status, status);
  }

  return body as T;
}
