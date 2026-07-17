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

export type TaskTrack = {
  min_ver?: string | null;
};

export type TaskPayload = {
  task_id: string;
  needScreenshot: boolean;
  task_status: number;
  expires: number;
  not_before: number;
  task_track?: TaskTrack;
  [field: string]: unknown;
};

export type TaskPatch = {
  task_status?: number;
  [field: string]: unknown;
};

export type QueueKind = "shot" | "nonShot";

export type TaskStatus = {
  StartTs: number;
  typeOfIdx: [string, string];
  sum_total: [number, number];
  sum_delete: [number, number];
  Total: [number, number];
  queue: [number, number];
  in_battle: [number, number];
  Finished: [number, number];
  error: [number, number];
  battle_timeout: [number, number];
  unknown: [number, number];
};

export type TaskStatistic = {
  cts: number;
  nts: number;
  fts: number;
  fs: number;
  sc: boolean;
};

export type TaskStatisticsDay = "0d" | "1d" | "2d";

export type TaskStatisticsByDay = {
  "0d": Record<string, TaskStatistic>;
  "1d": Record<string, TaskStatistic> | null;
  "2d": Record<string, TaskStatistic> | null;
};

export type FreqStatistic = {
  cts: number;
  infosc: Record<string, number>;
  infonc: Record<string, number>;
};
