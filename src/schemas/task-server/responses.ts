import * as v from "valibot";

export const ApiEnvelopeSchema = v.object({
  errCode: v.number(),
  msg: v.string(),
  data: v.exactOptional(v.unknown())
});

const TaskTrackSchema = v.object({
  min_ver: v.exactOptional(v.nullable(v.string()))
});

export const TaskPayloadSchema = v.looseObject({
  task_id: v.string(),
  needScreenshot: v.boolean(),
  task_status: v.number(),
  expires: v.number(),
  not_before: v.number(),
  task_track: v.exactOptional(TaskTrackSchema)
});

export const TaskPayloadJsonSchema = v.pipe(
  v.string(),
  v.parseJson(),
  TaskPayloadSchema
);

export const TaskPatchSchema = v.object({
  task_status: v.exactOptional(v.number())
});

const NumberPairSchema = v.tuple([v.number(), v.number()]);

export const TaskStatusSchema = v.object({
  StartTs: v.number(),
  typeOfIdx: v.tuple([v.string(), v.string()]),
  sum_total: NumberPairSchema,
  sum_delete: NumberPairSchema,
  Total: NumberPairSchema,
  queue: NumberPairSchema,
  in_battle: NumberPairSchema,
  Finished: NumberPairSchema,
  error: NumberPairSchema,
  battle_timeout: NumberPairSchema,
  unknown: NumberPairSchema
});

export const TaskStatisticSchema = v.object({
  cts: v.number(),
  nts: v.number(),
  fts: v.number(),
  fs: v.number(),
  sc: v.boolean()
});

export const TaskStatisticRecordSchema = v.record(v.string(), TaskStatisticSchema);
export const NullableTaskStatisticRecordSchema = v.nullable(TaskStatisticRecordSchema);

export const TaskStatisticsByDaySchema = v.object({
  "0d": TaskStatisticRecordSchema,
  "1d": NullableTaskStatisticRecordSchema,
  "2d": NullableTaskStatisticRecordSchema
});

export const FreqStatisticSchema = v.object({
  cts: v.number(),
  infosc: v.record(v.string(), v.number()),
  infonc: v.record(v.string(), v.number())
});

export const FreqStatisticsSchema = v.record(v.string(), FreqStatisticSchema);
export const StringArraySchema = v.array(v.string());
export const StringSchema = v.string();
export const NumberSchema = v.number();
export const NullSchema = v.null();

export type TaskPayload = v.InferOutput<typeof TaskPayloadSchema>;
export type TaskPatch = v.InferOutput<typeof TaskPatchSchema>;
export type TaskStatus = v.InferOutput<typeof TaskStatusSchema>;
export type TaskStatisticRecord = v.InferOutput<typeof TaskStatisticRecordSchema>;
export type TaskStatisticsByDay = v.InferOutput<typeof TaskStatisticsByDaySchema>;
export type FreqStatistic = v.InferOutput<typeof FreqStatisticSchema>;
