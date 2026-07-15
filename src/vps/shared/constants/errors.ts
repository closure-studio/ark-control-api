export const API_ERRORS = {
  unauthorized: "unauthorized",
  notFound: "not_found",
  badRequest: "bad_request",
  methodNotAllowed: "method_not_allowed",
  internalError: "internal_error"
} as const;

export type ApiErrorCode = (typeof API_ERRORS)[keyof typeof API_ERRORS];
