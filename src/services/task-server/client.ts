import * as v from "valibot";
import {
  ApiEnvelopeSchema,
  FreqStatisticsSchema,
  NullSchema,
  NullableTaskStatisticRecordSchema,
  NumberSchema,
  StringArraySchema,
  StringSchema,
  TaskPayloadJsonSchema,
  TaskStatisticsByDaySchema,
  TaskStatusSchema,
  type FreqStatistic,
  type TaskPatch,
  type TaskPayload,
  type TaskStatisticRecord,
  type TaskStatisticsByDay,
  type TaskStatus
} from "../../schemas/task-server/responses";
import type { QueueKind, TaskStatisticsDay } from "../../schemas/task-server/requests";
import {
  TASK_SERVER_AUTHORIZATION_BINDING,
  TASK_SERVER_BASE_URL_BINDING
} from "../../constants/task-server";
import type { Env } from "../../schemas/env";

export type TaskServerClientOptions = {
  fetch?: typeof fetch;
};

export type TaskServerEnv = Pick<
  Env,
  typeof TASK_SERVER_BASE_URL_BINDING | typeof TASK_SERVER_AUTHORIZATION_BINDING
>;

export type GetTaskOptions = {
  taskId?: string;
  needScreenshot?: boolean;
  nodeVersion?: string;
};

export type ListTasksOptions = {
  queue: QueueKind;
};

export type QueueOptions = {
  taskId: string;
  queue: QueueKind;
};

export type PatchIndexOptions = QueueOptions & {
  index: number;
};

export type TaskServerClient = {
  createTask(payload: TaskPayload): Promise<string>;
  getTask(options: GetTaskOptions): Promise<TaskPayload>;
  patchTask(taskId: string, patch: TaskPatch): Promise<null>;
  deleteTask(taskId?: string): Promise<null>;
  getIndex(options: QueueOptions): Promise<number>;
  patchIndex(options: PatchIndexOptions): Promise<number>;
  listTasks(options: ListTasksOptions): Promise<TaskPayload[]>;
  getStatus(): Promise<TaskStatus>;
  getTaskStatistics(): Promise<TaskStatisticsByDay>;
  getTaskStatisticsByDay(day: TaskStatisticsDay): Promise<TaskStatisticRecord | null>;
  getFreqStatistics(): Promise<Record<string, FreqStatistic>>;
};

export class TaskServerError extends Error {
  readonly status: number | undefined;
  readonly errCode: number | undefined;

  constructor(message: string, options: { status?: number; errCode?: number } = {}) {
    super(message);
    this.name = "TaskServerError";
    this.status = options.status;
    this.errCode = options.errCode;
  }
}

type RequestOptions = {
  method?: string;
  query?: Record<string, string | undefined>;
  body?: TaskPayload | TaskPatch;
};

export function createTaskServerClient(
  env: TaskServerEnv,
  options: TaskServerClientOptions = {}
): TaskServerClient {
  const baseUrl = env[TASK_SERVER_BASE_URL_BINDING]?.trim();
  const authorization = env[TASK_SERVER_AUTHORIZATION_BINDING]?.trim();
  const fetcher = options.fetch ?? fetch;

  async function request<TSchema extends v.GenericSchema>(
    path: string,
    dataSchema: TSchema,
    requestOptions: RequestOptions = {}
  ): Promise<v.InferOutput<TSchema>> {
    if (!baseUrl) {
      throw new TaskServerError(`Missing Cloudflare secret: ${TASK_SERVER_BASE_URL_BINDING}.`);
    }
    if (!authorization) {
      throw new TaskServerError(`Missing Cloudflare secret: ${TASK_SERVER_AUTHORIZATION_BINDING}.`);
    }

    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(requestOptions.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = { Authorization: authorization };
    let body: string | undefined;
    if (requestOptions.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(requestOptions.body);
    }

    const response = await fetcher(url.toString(), {
      method: requestOptions.method ?? "GET",
      headers,
      ...(body !== undefined ? { body } : {})
    });
    const json = await response.json().catch(() => undefined);
    if (json === undefined) {
      throw new TaskServerError("Task server returned invalid JSON.", {
        status: response.status
      });
    }

    const envelopeResult = v.safeParse(ApiEnvelopeSchema, json);
    if (!envelopeResult.success) {
      throw new TaskServerError("Task server returned an invalid response envelope.", {
        status: response.status
      });
    }
    const envelope = envelopeResult.output;

    if (!response.ok || envelope.errCode !== 0) {
      throw new TaskServerError(envelope.msg || "Task server request failed.", {
        status: response.status,
        errCode: envelope.errCode
      });
    }

    if (envelope.data === undefined) {
      throw new TaskServerError("Task server returned an invalid response envelope.", {
        status: response.status
      });
    }

    const dataResult = v.safeParse(dataSchema, envelope.data);
    if (!dataResult.success) {
      throw new TaskServerError("Task server returned an invalid response envelope.", {
        status: response.status
      });
    }
    return dataResult.output;
  }

  function needScreenshotValue(queue: QueueKind): string {
    return queue === "nonShot" ? "0" : "1";
  }

  function parseTask(value: string): TaskPayload {
    const result = v.safeParse(TaskPayloadJsonSchema, value);
    if (!result.success) {
      throw new TaskServerError("Task server returned invalid task JSON.");
    }
    return result.output;
  }

  return {
    createTask(payload) {
      return request("/task", StringSchema, { method: "POST", body: payload });
    },
    async getTask(options) {
      const data = await request("/task", StringSchema, {
        query: {
          task_id: options.taskId,
          need_screenshot:
            options.needScreenshot === undefined ? undefined : options.needScreenshot ? "1" : "0",
          node_ver: options.nodeVersion
        }
      });
      return parseTask(data);
    },
    patchTask(taskId, patch) {
      return request("/task", NullSchema, {
        method: "PATCH",
        query: { task_id: taskId },
        body: patch
      });
    },
    deleteTask(taskId) {
      return request("/task", NullSchema, {
        method: "DELETE",
        query: { task_id: taskId }
      });
    },
    getIndex(options) {
      return request("/index", NumberSchema, {
        query: {
          task_id: options.taskId,
          need_screenshot: needScreenshotValue(options.queue)
        }
      });
    },
    patchIndex(options) {
      return request("/index", NumberSchema, {
        method: "PATCH",
        query: {
          task_id: options.taskId,
          need_screenshot: needScreenshotValue(options.queue),
          index: String(options.index)
        }
      });
    },
    async listTasks(options) {
      const data = await request("/list/id", StringArraySchema, {
        query: { need_screenshot: needScreenshotValue(options.queue) }
      });
      return data.map(parseTask);
    },
    getStatus() {
      return request("/status", TaskStatusSchema);
    },
    getTaskStatistics() {
      return request("/statistics/task", TaskStatisticsByDaySchema);
    },
    getTaskStatisticsByDay(day) {
      return request(`/statistics/task/${day}`, NullableTaskStatisticRecordSchema);
    },
    getFreqStatistics() {
      return request("/statistics/freq", FreqStatisticsSchema);
    }
  };
}
