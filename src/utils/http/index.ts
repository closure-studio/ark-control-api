import type { Context } from "hono";
import { API_ERROR_CODES } from "../../constants/api/error-codes";
import type { ApiErrorCode } from "../../constants/api/error-codes";
import { ControlApiError } from "../../errors/control-api";
import type { Env } from "../../schemas/env";

type ApiContext = Context<{ Bindings: Env }>;

function jsonResponse(c: ApiContext, body: object, status: number) {
  const headers = new Headers(c.res.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { headers, status });
}

export function jsonData<T, M = never>(
  c: ApiContext,
  data: T,
  status = 200,
  meta?: M
) {
  const body = meta === undefined ? { data } : { data, meta };
  return jsonResponse(c, body, status);
}

export function jsonError(
  c: ApiContext,
  error: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown
) {
  const body = {
    error: details === undefined ? { code: error, message } : { code: error, message, details }
  };
  return jsonResponse(c, body, status);
}

export function validationErrorHook(result: {
  success: true;
} | {
  success: false;
  error: readonly { message: string }[];
}) {
  if (!result.success) {
    throw new ControlApiError(
      API_ERROR_CODES.BAD_REQUEST,
      result.error[0]?.message ?? "Invalid request.",
      400
    );
  }
}
