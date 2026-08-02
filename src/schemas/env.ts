import * as v from "valibot";

import type { ExecuteSshCommandRequest } from "./vps/ssh-command";

const D1DatabaseSchema = v.custom<D1Database>(
  (input) =>
    typeof input === "object" &&
    input !== null &&
    "prepare" in input &&
    typeof input.prepare === "function"
);

const AiBindingSchema = v.custom<Ai>(
  (input) =>
    typeof input === "object" && input !== null && "run" in input && typeof input.run === "function"
);

const ArkSshBindingSchema = v.custom<{
  executeCommand(request: ExecuteSshCommandRequest): Promise<unknown>;
}>(
  (input) =>
    typeof input === "object" &&
    input !== null &&
    "executeCommand" in input &&
    typeof input.executeCommand === "function"
);

const ControlJobAlarmNamespaceSchema = v.custom<DurableObjectNamespace>(
  (input) =>
    typeof input === "object" &&
    input !== null &&
    "getByName" in input &&
    typeof input.getByName === "function"
);

export const EnvSchema = v.object({
  DB: D1DatabaseSchema,
  AI: AiBindingSchema,
  ARK_SSH: ArkSshBindingSchema,
  CONTROL_JOB_ALARMS: ControlJobAlarmNamespaceSchema,
  ADMIN_TOKEN: v.string(),
  VPS_PASSWORD_KEY: v.string(),
  GITHUB_PYHELPER_TOKEN: v.string(),
  OIDC_ISSUER: v.string(),
  OIDC_KEY_ID: v.string(),
  OIDC_PRIVATE_KEY_PEM: v.string(),
  OIDC_SUBJECT: v.string(),
  PUBLIC_TOKEN_BEARER_SECRET: v.string(),
  ARKHOST_PASSPORT_EMAIL: v.string(),
  ARKHOST_PASSPORT_PASSWORD: v.string(),
  OIDC_TOKEN_TTL_SECONDS: v.exactOptional(v.string()),
  AI_MODEL: v.exactOptional(v.string()),
  QQBOT_TOKEN: v.exactOptional(v.string()),
  QQBOT_UID: v.exactOptional(v.string())
});

export type Env = v.InferOutput<typeof EnvSchema>;
