import type {
  ApiResponse,
  FreqStatistic,
  QueueKind,
  TaskPatch,
  TaskPayload,
  TaskStatistic,
  TaskStatisticsByDay,
  TaskStatisticsDay,
  TaskStatus
} from "../../types/gcp/task";
import {
  TASK_SERVER_AUTHORIZATION_BINDING,
  TASK_SERVER_BASE_URL_BINDING
} from "../../constants/task-server";
import type { Env } from "../../types/env";

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
  getTaskStatisticsByDay(day: TaskStatisticsDay): Promise<Record<string, TaskStatistic> | null>;
  getFreqStatistics(): Promise<Record<string, FreqStatistic>>;
};

export class TaskServerError extends Error {
  readonly status?: number;
  readonly errCode?: number;

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
  body?: unknown;
};

export function createTaskServerClient(
  env: TaskServerEnv,
  options: TaskServerClientOptions = {}
): TaskServerClient {
  const baseUrl = env[TASK_SERVER_BASE_URL_BINDING]?.trim();
  const authorization = env[TASK_SERVER_AUTHORIZATION_BINDING]?.trim();
  const fetcher = options.fetch ?? fetch;

  async function request<T>(path: string, requestOptions: RequestOptions = {}): Promise<T> {
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
      body
    });
    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      throw new TaskServerError("Task server returned invalid JSON.", {
        status: response.status
      });
    }

    if (!isApiResponse<T>(envelope)) {
      throw new TaskServerError("Task server returned an invalid response envelope.", {
        status: response.status
      });
    }

    if (!response.ok || envelope.errCode !== 0) {
      throw new TaskServerError(envelope.msg || "Task server request failed.", {
        status: response.status,
        errCode: envelope.errCode
      });
    }

    if (!("data" in envelope)) {
      throw new TaskServerError("Task server returned an invalid response envelope.", {
        status: response.status
      });
    }

    return envelope.data;
  }

  function needScreenshotValue(queue: QueueKind): string {
    return queue === "nonShot" ? "0" : "1";
  }

  function parseTask(value: string): TaskPayload {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new TaskServerError("Task server returned invalid task JSON.");
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new TaskServerError("Task server returned invalid task JSON.");
    }
    return parsed as TaskPayload;
  }

  return {
    createTask(payload) {
      return request<string>("/task", { method: "POST", body: payload });
    },
    async getTask(options) {
      const data = await request<string>("/task", {
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
      return request<null>("/task", {
        method: "PATCH",
        query: { task_id: taskId },
        body: patch
      });
    },
    deleteTask(taskId) {
      return request<null>("/task", {
        method: "DELETE",
        query: { task_id: taskId }
      });
    },
    getIndex(options) {
      return request<number>("/index", {
        query: {
          task_id: options.taskId,
          need_screenshot: needScreenshotValue(options.queue)
        }
      });
    },
    patchIndex(options) {
      return request<number>("/index", {
        method: "PATCH",
        query: {
          task_id: options.taskId,
          need_screenshot: needScreenshotValue(options.queue),
          index: String(options.index)
        }
      });
    },
    async listTasks(options) {
      const data = await request<string[]>("/list/id", {
        query: { need_screenshot: needScreenshotValue(options.queue) }
      });
      return data.map(parseTask);
    },
    getStatus() {
      return request<TaskStatus>("/status");
    },
    getTaskStatistics() {
      return request<TaskStatisticsByDay>("/statistics/task");
    },
    getTaskStatisticsByDay(day) {
      return request<Record<string, TaskStatistic> | null>(`/statistics/task/${day}`);
    },
    getFreqStatistics() {
      return request<Record<string, FreqStatistic>>("/statistics/freq");
    }
  };
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { errCode?: unknown }).errCode === "number" &&
    typeof (value as { msg?: unknown }).msg === "string"
  );
}
