import * as v from "valibot";

export const QueueKindSchema = v.picklist(["shot", "nonShot"]);
export const TaskStatisticsDaySchema = v.picklist(["0d", "1d", "2d"]);

export type QueueKind = v.InferOutput<typeof QueueKindSchema>;
export type TaskStatisticsDay = v.InferOutput<typeof TaskStatisticsDaySchema>;
