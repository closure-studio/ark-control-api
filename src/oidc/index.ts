import { WorkerEntrypoint } from "cloudflare:workers";

import { app } from "./app";
import type { Env } from "./model/env";
import type {
  IssueOidcTokenOptions,
  OidcTokenSuccessResponse,
} from "./model/oidc";
import { issueOidcToken } from "./service/oidc";

export default class ArkOidcWorker extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env, this.ctx);
  }

  async issueToken(
    options: IssueOidcTokenOptions,
  ): Promise<OidcTokenSuccessResponse> {
    return issueOidcToken(this.env, options);
  }
}

export { app };
