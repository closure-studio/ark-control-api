import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ControlApiError } from "../../types/control/errors";
import type { ApiContext } from "../../types/http";

export function jsonError(
  c: ApiContext,
  error: string,
  message: string,
  status: number,
  details?: unknown
) {
  return c.json(
    details === undefined ? { error, message } : { error, message, details },
    status as ContentfulStatusCode
  );
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
