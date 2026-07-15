import type { ApiErrorCode } from "../../shared/constants/errors";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export function jsonError(error: ApiErrorCode, status: number, message?: string): Response {
  return jsonResponse(message ? { error, message } : { error }, status);
}
