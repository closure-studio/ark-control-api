import type { Context } from "hono";
import type { WorkerHonoEnv } from "../model/schema/worker";
import { errorBody } from "../utils/http";

export function handleUnexpectedError(error: Error, c: Context<WorkerHonoEnv>) {
  console.error("Unexpected API error", error);
  return c.json(errorBody("Internal server error."), 500);
}
