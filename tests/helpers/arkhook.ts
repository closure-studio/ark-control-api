import type { TaskFailureRecord } from "../../src/schemas/arkhook/records";

export const TASK_ID = "8531aece-1234-4567-89ab-123456789abc";
export function failureRecord(taskId = TASK_ID): TaskFailureRecord {
  return {
    version: 1,
    recordedAt: 1792627200000,
    node_name: "node-01",
    instance_id: "1",
    stageId: "act52side_08",
    battleRank: 1,
    reason: 1,
    task: {
      task_id: taskId,
      task_type: 1,
      task_status: 0,
      user_name: "测试用户",
      needScreenshot: 0,
      task_data: {
        replay: "原始录像",
        troop: { members: [{ charId: "char_12f", skillIndex: -1 }] },
        extraParams: null,
        timeScale: 1
      },
      task_track: { dispatch: "retained" }
    },
    completion: {
      task_status: 3,
      task_result: {
        battleData: '{"battleRank":1}',
        battleDataInRequest: { native: "结算" },
        fixedPlayTime: 120,
        native_extension: { retained: true }
      },
      task_pic: [],
      task_msg: "战败",
      task_err: "",
      agent_elapsed: 15000,
      _battle_lose_hp_zero: 1
    },
    extension: { retained: [1, "two", null] }
  };
}
