import * as v from "valibot";
import { objectSchema, recordSchema } from "../object";

export const ApiEnvelopeSchema = objectSchema({
  errCode: v.number(),
  msg: v.string(),
  data: v.exactOptional(v.unknown())
});

const TaskTrackSchema = objectSchema({
  min_ver: v.exactOptional(v.nullable(v.string()))
});

export const TaskPayloadSchema = objectSchema({
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

export const TaskPatchSchema = objectSchema({
  task_status: v.exactOptional(v.number())
});

const NumberPairSchema = v.tuple([v.number(), v.number()]);

export const TaskStatusSchema = objectSchema({
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

export const TaskStatisticSchema = objectSchema({
  cts: v.number(),
  nts: v.number(),
  fts: v.number(),
  fs: v.number(),
  sc: v.boolean()
});

export const TaskStatisticRecordSchema = recordSchema(TaskStatisticSchema);
export const NullableTaskStatisticRecordSchema = v.nullable(TaskStatisticRecordSchema);

export const TaskStatisticsByDaySchema = objectSchema({
  "0d": TaskStatisticRecordSchema,
  "1d": NullableTaskStatisticRecordSchema,
  "2d": NullableTaskStatisticRecordSchema
});

export const FreqStatisticSchema = objectSchema({
  cts: v.number(),
  infosc: recordSchema(v.number()),
  infonc: recordSchema(v.number())
});

export const FreqStatisticsSchema = recordSchema(FreqStatisticSchema);
export const StringArraySchema = v.array(v.string());
export const StringSchema = v.string();
export const NumberSchema = v.number();
export const NullSchema = v.null();
