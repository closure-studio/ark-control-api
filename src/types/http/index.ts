import type { Context } from "hono";
import type { ApiErrorCode } from "../../constants/api/error-codes";
import type { Env } from "../env";

export type ApiContext = Context<{ Bindings: Env }>;
export type { ApiErrorCode } from "../../constants/api/error-codes";

export type ApiSuccess<T, M = never> = {
  data: T;
  meta?: M;
};

export type ApiFailure = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};
