import * as v from "valibot";

const TimestampSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const NonEmptyStringSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(256));
export const TaskIdSchema = v.pipe(v.string(), v.uuid());
const JsonObjectSchema = v.record(v.string(), v.unknown());

// Open objects deliberately retain task-server extensions and native result fields.
const BattleResultSchema = v.looseObject({
  battleData: v.string(),
  battleDataInRequest: JsonObjectSchema,
  fixedPlayTime: v.pipe(v.number(), v.finite(), v.minValue(0))
});
const TaskSchema = v.looseObject({
  task_id: TaskIdSchema,
  task_type: v.pipe(v.number(), v.integer()),
  task_status: v.picklist([0, 1, 2, 3, 4]),
  user_name: v.string(),
  needScreenshot: v.literal(0),
  // Invalid battle input must remain archivable when it caused execution to fail.
  task_data: JsonObjectSchema
});
const CompletionSchema = v.looseObject({
  task_status: v.picklist([2, 3, 4]),
  task_result: v.nullable(BattleResultSchema),
  task_pic: v.pipe(v.array(v.string()), v.maxLength(0)),
  task_msg: v.string(),
  task_err: v.string()
});

export const TaskFailureRecordSchema = v.pipe(
  v.looseObject({
    version: v.literal(1),
    recordedAt: TimestampSchema,
    node_name: NonEmptyStringSchema,
    instance_id: NonEmptyStringSchema,
    stageId: v.nullable(NonEmptyStringSchema),
    battleRank: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(3))),
    reason: v.nullable(v.picklist([0, 1, 2, 3])),
    task: TaskSchema,
    completion: CompletionSchema
  }),
  v.check(
    (record) =>
      !(
        record.reason === 0 &&
        record.battleRank === 3 &&
        record.completion.task_status === 2 &&
        record.completion.task_result !== null &&
        record.completion.task_err === ""
      ),
    "Normally completed three-star tasks are not failure records."
  ),
  v.check(
    (record) => record.completion.task_status !== 2 || record.completion.task_result !== null,
    "Completed tasks require a battle result."
  )
);

export const StoredTaskFailureSchema = v.pipe(v.string(), v.parseJson(), TaskFailureRecordSchema);
export type TaskFailureRecord = v.InferOutput<typeof TaskFailureRecordSchema>;
