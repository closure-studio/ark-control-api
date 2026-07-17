import { Hono, type Context } from "hono";
import {
  createGenericTokenFailureResponse,
  createOidcDiscoveryMetadata,
  createOidcJwks,
  createTokenFailureResponse,
  issueOidcToken
} from "../../control/oidc";
import {
  OIDC_ERROR_CODES,
  OIDC_ERROR_MESSAGES,
  OIDC_METADATA_CACHE_CONTROL,
  OIDC_TOKEN_CACHE_CONTROL
} from "../../constants/oidc";
import type { Env } from "../../env";

type OidcContext = Context<{ Bindings: Env }>;

const APP_NAME = "ark-OIDC";
const ROOT_RESPONSE_TEXT = `${APP_NAME} Worker`;
const OIDC_PATHS = new Set([
  "/",
  "/health",
  "/.well-known/openid-configuration",
  "/jwks.json",
  "/token"
]);
const LOCAL_OIDC_PATHS = new Set([
  "/.well-known/openid-configuration",
  "/jwks.json",
  "/token"
]);

function jsonHeaders(cacheControl: string): Record<string, string> {
  return { "Cache-Control": cacheControl };
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

async function readTokenAudience(c: OidcContext): Promise<string> {
  if (c.req.method !== "POST") return c.req.query("audience") ?? "";
  const body = await c.req.json<{ audience?: unknown }>();
  return typeof body.audience === "string" ? body.audience : "";
}

function tokenFailure(c: OidcContext, status: 500 | 401, code?: string, message?: string) {
  const body =
    code && message
      ? createTokenFailureResponse(code, message)
      : createGenericTokenFailureResponse();
  return c.json(body, status, jsonHeaders(OIDC_TOKEN_CACHE_CONTROL));
}

export const oidcRouter = new Hono<{ Bindings: Env }>();

oidcRouter.get("/", (c) => c.text(ROOT_RESPONSE_TEXT));
oidcRouter.get("/health", (c) => c.json({ name: APP_NAME, status: "ok" }));
oidcRouter.get("/.well-known/openid-configuration", (c) => {
  try {
    return c.json(
      createOidcDiscoveryMetadata(c.env),
      200,
      jsonHeaders(OIDC_METADATA_CACHE_CONTROL)
    );
  } catch (error) {
    console.error(error);
    return tokenFailure(c, 500);
  }
});
oidcRouter.get("/jwks.json", async (c) => {
  try {
    return c.json(
      await createOidcJwks(c.env),
      200,
      jsonHeaders(OIDC_METADATA_CACHE_CONTROL)
    );
  } catch (error) {
    console.error(error);
    return tokenFailure(c, 500);
  }
});

async function handleToken(c: OidcContext) {
  const secret = c.env.PUBLIC_TOKEN_BEARER_SECRET?.trim();
  if (!secret) {
    console.error("Missing public token Bearer secret");
    return tokenFailure(c, 500);
  }
  if (c.req.header("authorization") !== `Bearer ${secret}`) {
    return tokenFailure(
      c,
      401,
      OIDC_ERROR_CODES.unauthorized,
      OIDC_ERROR_MESSAGES.unauthorized
    );
  }
  try {
    return c.json(
      await issueOidcToken(c.env, { audience: await readTokenAudience(c) }),
      200,
      jsonHeaders(OIDC_TOKEN_CACHE_CONTROL)
    );
  } catch (error) {
    console.error(error);
    return tokenFailure(c, 500);
  }
}

oidcRouter.get("/token", handleToken);
oidcRouter.post("/token", handleToken);

export function shouldHandleOidcRequest(request: Request, env: Env): boolean {
  const url = new URL(request.url);
  const issuerHost = new URL(env.OIDC_ISSUER).host;
  return (
    (url.host === issuerHost && OIDC_PATHS.has(url.pathname)) ||
    (isLocalHostname(url.hostname) && LOCAL_OIDC_PATHS.has(url.pathname))
  );
}
