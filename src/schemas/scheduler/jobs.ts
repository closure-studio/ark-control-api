import * as v from "valibot";

export const CONTROL_JOB_NAMES = [
  "apk-delivery",
  "maintenance-monitor",
  "maintenance-pre-action",
  "retention"
] as const;

export const ControlJobNameSchema = v.picklist(CONTROL_JOB_NAMES);

export type ControlJobName = v.InferOutput<typeof ControlJobNameSchema>;
