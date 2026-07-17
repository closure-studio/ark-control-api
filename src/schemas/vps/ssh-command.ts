import * as v from "valibot";

export const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
export const MAX_COMMAND_TIMEOUT_MS = 600_000;

export const ExecuteHostCommandRequestSchema = v.object({
  hostId: v.pipe(
    v.number("host_id_invalid"),
    v.integer("host_id_invalid"),
    v.minValue(1, "host_id_invalid")
  ),
  command: v.exactOptional(
    v.pipe(v.string("command_invalid"), v.trim(), v.nonEmpty("command_invalid"))
  ),
  timeoutMs: v.optional(
    v.pipe(
      v.number("timeout_invalid"),
      v.integer("timeout_invalid"),
      v.minValue(1, "timeout_invalid"),
      v.maxValue(MAX_COMMAND_TIMEOUT_MS, "timeout_invalid")
    ),
    DEFAULT_COMMAND_TIMEOUT_MS
  )
});

export type NormalizedExecuteHostCommandRequest = v.InferOutput<
  typeof ExecuteHostCommandRequestSchema
>;
