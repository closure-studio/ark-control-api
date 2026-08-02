import * as v from "valibot";

import { ControlJobNameSchema } from "./jobs";

export const SchedulerEnsureResponseSchema = v.object({
  ensuredJobs: v.array(ControlJobNameSchema)
});

export type SchedulerEnsureResponse = v.InferOutput<typeof SchedulerEnsureResponseSchema>;
