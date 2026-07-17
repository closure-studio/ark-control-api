export const API_ERROR_CODES = {
  BAD_REQUEST: "bad_request",
  INTERNAL_ERROR: "internal_error",
  NOT_FOUND: "not_found",
  REQUEST_FAILED: "request_failed",
  UNAUTHORIZED: "unauthorized",
  GCP_SERVICE_ERROR: "gcp_error",
  VPS_CLOUD_CREATE_FAILED: "cloud_create_failed",
  VPS_HOST_REGISTRATION_FAILED: "host_registration_failed",
  PYHELPER_INVALID_DOWNLOAD_REQUEST: "invalid_download_request",
  PYHELPER_DOWNLOAD_FAILED: "pyhelper_download_failed"
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
