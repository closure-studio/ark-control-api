import type { Context } from "hono";
import type { Env } from "../../env";

export type ApiContext = Context<{ Bindings: Env }>;

export type ApiSuccess<T, M = never> = {
  data: T;
  meta?: M;
};

export type ApiFailure = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
