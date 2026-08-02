import * as v from "valibot";

export const HostProcessStateSchema = v.picklist(["running", "exited", "unknown"]);

export const HostLogSnapshotSchema = v.object({
  logTail: v.string(),
  processState: HostProcessStateSchema,
  exitCode: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(255)))
});

export type HostProcessState = v.InferOutput<typeof HostProcessStateSchema>;
export type HostLogSnapshot = v.InferOutput<typeof HostLogSnapshotSchema>;
