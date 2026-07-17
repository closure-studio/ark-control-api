import type { InferOutput } from "valibot";
import type {
  FreqStatisticSchema,
  TaskPatchSchema,
  TaskPayloadSchema,
  TaskStatisticRecordSchema,
  TaskStatisticSchema,
  TaskStatisticsByDaySchema,
  TaskStatusSchema
} from "../../schemas/task-server/responses";

export type ApiResponse<T> = {
  errCode: number;
  msg: string;
  data: T;
};

export type ApiError = {
  errCode: number;
  msg: string;
  error?: string;
};

export type UnauthorizedResponse = {
  errCode: 2;
  msg: "Unauthorized";
};

export type TaskPayload = InferOutput<typeof TaskPayloadSchema>;
export type TaskPatch = InferOutput<typeof TaskPatchSchema>;

export type QueueKind = "shot" | "nonShot";

export type TaskStatus = InferOutput<typeof TaskStatusSchema>;
export type TaskStatistic = InferOutput<typeof TaskStatisticSchema>;

export type TaskStatisticsDay = "0d" | "1d" | "2d";

export type TaskStatisticRecord = InferOutput<typeof TaskStatisticRecordSchema>;
export type TaskStatisticsByDay = InferOutput<typeof TaskStatisticsByDaySchema>;
export type FreqStatistic = InferOutput<typeof FreqStatisticSchema>;
