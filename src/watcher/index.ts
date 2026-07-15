import { handleRequest } from "./routes/router";
import { runPipelineForEnv } from "./services/pipelineService";
import type { Env } from "./types";

const worker: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    return await handleRequest(request, env);
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(runPipelineForEnv(env));
  },
};

export default worker;
