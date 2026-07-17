import type { Context } from "hono";
import type { Env } from "../../env";

export type ApiContext = Context<{ Bindings: Env }>;
