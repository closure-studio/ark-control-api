import type { Context } from "hono";

import { createHealthResponse } from "../utils/health";

export const healthController = (c: Context) => c.json(createHealthResponse());
