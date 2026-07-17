export class ControlApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "ControlApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
