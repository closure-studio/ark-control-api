import { Hono } from "hono";
import type { Env } from "./env";
import { app as oidcApp } from "./oidc/app";
import { runPipelineForEnv } from "./watcher/services/pipelineService";
import { runRetentionCleanup } from "./retention";
import { createControlRouter } from "./control/router";

export const api = new Hono<{ Bindings: Env }>();

api.get("/health", (c) => c.json({ ok: true, service: "ark-control-api", time: new Date().toISOString() }));
api.route("/", createControlRouter());
api.notFound((c) => c.json({ error: "not_found" }, 404));

function isOidcPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/health" ||
    pathname === "/.well-known/openid-configuration" ||
    pathname === "/jwks.json" ||
    pathname === "/token"
  );
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const issuerHost = new URL(env.OIDC_ISSUER).host;
    const localOidcPath = isLocalHostname(url.hostname) && [
      "/.well-known/openid-configuration",
      "/jwks.json",
      "/token"
    ].includes(url.pathname);
    if ((url.host === issuerHost && isOidcPath(url.pathname)) || localOidcPath) {
      return await oidcApp.fetch(request, env, ctx);
    }
    return await api.fetch(request, env, ctx);
  },

  scheduled(event, env, ctx): void {
    ctx.waitUntil(event.cron === "15 3 * * *" ? runRetentionCleanup(env) : runPipelineForEnv(env));
  }
} satisfies ExportedHandler<Env>;
