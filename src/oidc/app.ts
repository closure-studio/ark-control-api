import { Hono } from "hono";

import type { Env } from "./model/env";
import { router } from "./router";

const app = new Hono<{ Bindings: Env }>();

app.route("/", router);

export { app };
