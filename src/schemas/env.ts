import * as v from "valibot";

import type {
  ExecuteHostCommandResult,
  ExecuteSshCommandRequest
} from "./vps/ssh-command";

const D1DatabaseSchema = v.custom<D1Database>(
  (input) =>
    typeof input === "object" &&
    input !== null &&
    "prepare" in input &&
    typeof input.prepare === "function"
);

const AiBindingSchema = v.custom<Ai>(
  (input) =>
    typeof input === "object" &&
    input !== null &&
    "run" in input &&
    typeof input.run === "function"
);

const ArkSshBindingSchema = v.custom<{
  executeCommand(request: ExecuteSshCommandRequest): Promise<ExecuteHostCommandResult>;
}>(
  (input) =>
    typeof input === "object" &&
    input !== null &&
    "executeCommand" in input &&
    typeof input.executeCommand === "function"
);

export const EnvSchema = v.object({
  DB: D1DatabaseSchema,
  AI: AiBindingSchema,
  ARK_SSH: ArkSshBindingSchema,
  ADMIN_TOKEN: v.string(),
  VPS_PASSWORD_KEY: v.string(),
  GITHUB_PYHELPER_TOKEN: v.string(),
  TASK_SERVER_BASE_URL: v.string(),
  TASK_SERVER_AUTHORIZATION: v.string(),
  OIDC_ISSUER: v.string(),
  OIDC_KEY_ID: v.string(),
  OIDC_PRIVATE_KEY_PEM: v.string(),
  OIDC_SUBJECT: v.string(),
  PUBLIC_TOKEN_BEARER_SECRET: v.string(),
  OIDC_TOKEN_TTL_SECONDS: v.exactOptional(v.string()),
  AI_MODEL: v.exactOptional(v.string()),
  QQBOT_TOKEN: v.exactOptional(v.string()),
  QQBOT_UID: v.exactOptional(v.string())
});

export type Env = v.InferOutput<typeof EnvSchema>;
