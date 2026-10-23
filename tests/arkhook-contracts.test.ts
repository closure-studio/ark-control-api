import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { TaskFailureRecordSchema } from "../src/schemas/arkhook/records";
import {
  TaskFailureListQuerySchema,
  TaskFailureUploadSchema
} from "../src/schemas/arkhook/requests";
import { failureRecord } from "./helpers/arkhook";

describe("ArkHook archive contracts", () => {
  it("derives summaries and preserves complete input, native extensions and unknown fields", () => {
    const record = failureRecord();
    const normalized = v.parse(TaskFailureUploadSchema, record);
    expect(normalized).toEqual({
      task_id: record.task.task_id,
      stage_id: record.stageId,
      battle_rank: 1,
      recorded_at: record.recordedAt,
      record_json: JSON.stringify(record)
    });
    expect(JSON.parse(normalized.record_json)).toEqual(record);
  });
  it("accepts low-star Completed results, protocol errors with three stars and malformed battle input", () => {
    const record = failureRecord();
    expect(
      v.safeParse(TaskFailureRecordSchema, {
        ...record,
        reason: 0,
        battleRank: 2,
        completion: { ...record.completion, task_status: 2 }
      }).success
    ).toBe(true);
    expect(
      v.safeParse(TaskFailureRecordSchema, {
        ...record,
        reason: 0,
        battleRank: 3,
        completion: { ...record.completion, task_err: "remote conflict" }
      }).success
    ).toBe(true);
    expect(
      v.safeParse(TaskFailureRecordSchema, {
        ...record,
        stageId: null,
        battleRank: null,
        reason: null,
        task: { ...record.task, task_data: { replay: null, invalid: true } },
        completion: { ...record.completion, task_result: null, task_err: "invalid input" }
      }).success
    ).toBe(true);
  });
  it.each([
    { version: 2 },
    { recordedAt: -1 },
    { recordedAt: Number.MAX_SAFE_INTEGER + 1 },
    { battleRank: -1 },
    { battleRank: 4 },
    { reason: 4 },
    { stageId: "" },
    { task: { ...failureRecord().task, task_id: "not-a-uuid" } },
    { completion: { ...failureRecord().completion, task_status: 1 } },
    { completion: { ...failureRecord().completion, task_status: 2, task_result: null } },
    { reason: 0, battleRank: 3, completion: { ...failureRecord().completion, task_status: 2 } }
  ])("rejects invalid or normally successful records: %j", (patch) => {
    expect(v.safeParse(TaskFailureRecordSchema, { ...failureRecord(), ...patch }).success).toBe(
      false
    );
  });
  it("normalizes pagination and numeric filters", () => {
    expect(v.parse(TaskFailureListQuerySchema, {})).toEqual({ limit: 50, offset: 0 });
    expect(
      v.parse(TaskFailureListQuerySchema, {
        limit: "999",
        offset: "2",
        stage_id: "act52side_08",
        battle_rank: "0",
        recorded_from: "0",
        recorded_to: "1792627200000"
      })
    ).toEqual({
      limit: 100,
      offset: 2,
      stage_id: "act52side_08",
      battle_rank: 0,
      recorded_from: 0,
      recorded_to: 1792627200000
    });
  });
  it.each([
    { battle_rank: "4" },
    { recorded_from: "-1" },
    { recorded_from: "10", recorded_to: "9" },
    { recorded_to: "9007199254740992" },
    { limit: "1.5" }
  ])("rejects bad filters: %j", (query) => {
    expect(v.safeParse(TaskFailureListQuerySchema, query).success).toBe(false);
  });
});
