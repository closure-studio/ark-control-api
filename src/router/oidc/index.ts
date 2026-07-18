import { Hono, type Context } from "hono";
import { sValidator } from "@hono/standard-validator";
import {
  createGenericTokenFailureResponse,
  createOidcDiscoveryMetadata,
  createOidcJwks,
  createTokenFailureResponse,
  issueOidcToken
} from "../../controller/oidc";
import {
  OIDC_ERROR_CODES,
  OIDC_ERROR_MESSAGES,
  OIDC_APP_NAME,
  OIDC_METADATA_CACHE_CONTROL,
  OIDC_TOKEN_CACHE_CONTROL
} from "../../constants/oidc";
import type { Env } from "../../schemas/env";
import type { OidcHealthResponse } from "../../schemas/health/responses";
import { OidcTokenRequestSchema } from "../../schemas/oidc/token";

type OidcContext = Context<{ Bindings: Env }>;

const ROOT_RESPONSE_TEXT = `${OIDC_APP_NAME} Worker`;
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

function tokenFailure(c: OidcContext, status: 500 | 401, code?: string, message?: string) {
  const body =
    code && message
      ? createTokenFailureResponse(code, message)
      : createGenericTokenFailureResponse();
  return c.json(body, status, jsonHeaders(OIDC_TOKEN_CACHE_CONTROL));
}

function oidcValidationErrorHook(
  result:
    | { success: true }
    | { success: false; error: readonly { message: string }[] },
  c: OidcContext
) {
  if (!result.success) {
    return c.json(
      createTokenFailureResponse(
        OIDC_ERROR_CODES.invalidRequest,
        OIDC_ERROR_MESSAGES.invalidRequest
      ),
      400,
      jsonHeaders(OIDC_TOKEN_CACHE_CONTROL)
    );
  }
}

export const oidcRouter = new Hono<{ Bindings: Env }>();

oidcRouter.get("/", (c) => c.text(ROOT_RESPONSE_TEXT));
oidcRouter.get("/health", (c) => {
  const response: OidcHealthResponse = { name: OIDC_APP_NAME, status: "ok" };
  return c.json(response);
});
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

async function handleToken(c: OidcContext, audience: string) {
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
      await issueOidcToken(c.env, { audience }),
      200,
      jsonHeaders(OIDC_TOKEN_CACHE_CONTROL)
    );
  } catch (error) {
    console.error(error);
    return tokenFailure(c, 500);
  }
}

oidcRouter.get(
  "/token",
  sValidator("query", OidcTokenRequestSchema, oidcValidationErrorHook),
  (c) => handleToken(c, c.req.valid("query").audience)
);
oidcRouter.post(
  "/token",
  sValidator("json", OidcTokenRequestSchema, oidcValidationErrorHook),
  (c) => handleToken(c, c.req.valid("json").audience)
);

export function shouldHandleOidcRequest(request: Request, env: Env): boolean {
  const url = new URL(request.url);
  const issuerHost = new URL(env.OIDC_ISSUER).host;
  return (
    (url.host === issuerHost && OIDC_PATHS.has(url.pathname)) ||
    (isLocalHostname(url.hostname) && LOCAL_OIDC_PATHS.has(url.pathname))
  );
}
