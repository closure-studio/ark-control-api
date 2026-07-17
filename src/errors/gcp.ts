export class GcpError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "GcpError";
    this.status = status;
  }
}

export class GcpConfigurationError extends GcpError {
  constructor(message: string) {
    super(message, 500);
    this.name = "GcpConfigurationError";
  }
}

export class GoogleApiError extends GcpError {
  readonly googleStatus: string | undefined;

  constructor(message: string, status: number, googleStatus?: string) {
    super(message, status);
    this.name = "GoogleApiError";
    this.googleStatus = googleStatus;
  }
}
