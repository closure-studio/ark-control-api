import type { Context } from "hono";

import { ROOT_RESPONSE_TEXT } from "../constants/app";

export const rootController = (c: Context) => c.text(ROOT_RESPONSE_TEXT);
