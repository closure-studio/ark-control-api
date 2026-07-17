export interface ExecuteSshCommandRequest {
  hostname: string;
  port: number;
  username: string;
  password: string;
  command: string;
  timeoutMs?: number;
}

export interface ExecuteSshCommandResult {
  connected: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  success: boolean;
  timedOut: boolean;
}

export interface ArkSshBinding {
  executeCommand(request: ExecuteSshCommandRequest): Promise<ExecuteSshCommandResult>;
}

export interface Env {
  DB: D1Database;
  AI: Ai;
  ARK_SSH: ArkSshBinding;
  ADMIN_TOKEN: string;
  VPS_PASSWORD_KEY: string;
  GITHUB_PYHELPER_TOKEN: string;
  TASK_SERVER_BASE_URL: string;
  TASK_SERVER_AUTHORIZATION: string;
  OIDC_ISSUER: string;
  OIDC_KEY_ID: string;
  OIDC_PRIVATE_KEY_PEM: string;
  OIDC_SUBJECT: string;
  PUBLIC_TOKEN_BEARER_SECRET: string;
  OIDC_TOKEN_TTL_SECONDS?: string;
  AI_MODEL?: string;
  QQBOT_TOKEN?: string;
  QQBOT_UID?: string;
}
