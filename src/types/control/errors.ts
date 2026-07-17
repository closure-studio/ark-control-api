import type { ApiErrorCode } from "../http";

export class ControlApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "ControlApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
