import * as v from "valibot";

export const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
export const MAX_COMMAND_TIMEOUT_MS = 600_000;

const CommandTimeoutSchema = v.pipe(
  v.number("timeout_invalid"),
  v.integer("timeout_invalid"),
  v.minValue(1, "timeout_invalid"),
  v.maxValue(MAX_COMMAND_TIMEOUT_MS, "timeout_invalid")
);

export const ExecuteHostCommandRequestSchema = v.object({
  hostId: v.pipe(
    v.number("host_id_invalid"),
    v.integer("host_id_invalid"),
    v.minValue(1, "host_id_invalid")
  ),
  command: v.exactOptional(
    v.pipe(v.string("command_invalid"), v.trim(), v.nonEmpty("command_invalid"))
  ),
  timeoutMs: v.exactOptional(CommandTimeoutSchema)
});

export const NormalizedExecuteHostCommandRequestSchema = v.pipe(
  ExecuteHostCommandRequestSchema,
  v.transform(({ timeoutMs, ...request }) => ({
    ...request,
    timeoutMs: timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
  }))
);

const ExecuteSshCommandRequestEntries = {
  hostname: v.string(),
  port: v.number(),
  username: v.string(),
  password: v.string(),
  command: v.string()
};

export const ExecuteSshCommandRequestSchema = v.object({
  ...ExecuteSshCommandRequestEntries,
  timeoutMs: v.exactOptional(v.number())
});

export const NormalizedExecuteSshCommandRequestSchema = v.object({
  ...ExecuteSshCommandRequestEntries,
  timeoutMs: v.number()
});

export const ExecuteHostCommandResultSchema = v.object({
  connected: v.boolean(),
  stdout: v.string(),
  stderr: v.string(),
  exitCode: v.nullable(v.number()),
  signal: v.nullable(v.string()),
  success: v.boolean(),
  timedOut: v.boolean()
});

export type ExecuteHostCommandRequest = v.InferOutput<typeof ExecuteHostCommandRequestSchema>;

export type NormalizedExecuteHostCommandRequest = v.InferOutput<
  typeof NormalizedExecuteHostCommandRequestSchema
>;
export type ExecuteSshCommandRequest = v.InferOutput<typeof ExecuteSshCommandRequestSchema>;
export type NormalizedExecuteSshCommandRequest = v.InferOutput<
  typeof NormalizedExecuteSshCommandRequestSchema
>;
export type ExecuteHostCommandResult = v.InferOutput<typeof ExecuteHostCommandResultSchema>;
