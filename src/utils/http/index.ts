import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ControlApiError } from "../../types/control/errors";
import type { ApiContext, ApiFailure, ApiSuccess } from "../../types/http";

export function jsonData<T, M = never>(
  c: ApiContext,
  data: T,
  status = 200,
  meta?: M
) {
  const body: ApiSuccess<T, M> = meta === undefined ? { data } : { data, meta };
  return c.json(body, status as ContentfulStatusCode);
}

export function jsonError(
  c: ApiContext,
  error: string,
  message: string,
  status: number,
  details?: unknown
) {
  const body: ApiFailure = {
    error: details === undefined ? { code: error, message } : { code: error, message, details }
  };
  return c.json(body, status as ContentfulStatusCode);
}

export function parseId(value: string): number | null {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

export async function readBody(c: ApiContext): Promise<Record<string, unknown>> {
  const value = await c.req.json().catch(() => null);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ControlApiError("bad_request", "Request body must be an object.", 400);
  }
  return value as Record<string, unknown>;
}
