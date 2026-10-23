import * as v from "valibot";

import { PaginationQueryEntries } from "../pagination";
import { TaskFailureRecordSchema, TaskIdSchema } from "./records";

const TimestampQuerySchema = v.pipe(
  v.string(),
  v.regex(/^\d+$/),
  v.transform(Number),
  v.safeInteger()
);

export const TaskFailureUploadSchema = v.pipe(
  TaskFailureRecordSchema,
  v.transform((record) => ({
    task_id: record.task.task_id,
    stage_id: record.stageId,
    battle_rank: record.battleRank,
    recorded_at: record.recordedAt,
    record_json: JSON.stringify(record)
  }))
);
export const TaskFailureParamSchema = v.object({ task_id: TaskIdSchema });
export const TaskFailureListQuerySchema = v.pipe(
  v.object({
    ...PaginationQueryEntries,
    stage_id: v.exactOptional(v.pipe(v.string(), v.minLength(1), v.maxLength(256))),
    battle_rank: v.exactOptional(v.pipe(v.picklist(["0", "1", "2", "3"]), v.transform(Number))),
    recorded_from: v.exactOptional(TimestampQuerySchema),
    recorded_to: v.exactOptional(TimestampQuerySchema)
  }),
  v.check(
    (query) =>
      query.recorded_from === undefined ||
      query.recorded_to === undefined ||
      query.recorded_from <= query.recorded_to,
    "recorded_from must not exceed recorded_to."
  ),
  v.transform(({ limit, offset, ...filters }) => ({
    ...filters,
    limit: limit ?? 50,
    offset: offset ?? 0
  }))
);
export type TaskFailureUpload = v.InferOutput<typeof TaskFailureUploadSchema>;
export type TaskFailureListQuery = v.InferOutput<typeof TaskFailureListQuerySchema>;
