import type { Context } from "hono";

import {
  OIDC_ERROR_CODES,
  OIDC_ERROR_MESSAGES,
  OIDC_METADATA_CACHE_CONTROL,
  OIDC_TOKEN_CACHE_CONTROL,
} from "../constants/oidc";
import type { Env } from "../model/env";
import {
  createGenericTokenFailureResponse,
  createOidcDiscoveryMetadata,
  createOidcJwks,
  createTokenFailureResponse,
  issueOidcToken,
} from "../service/oidc";

type OidcContext = Context<{ Bindings: Env }>;

const jsonHeaders = (cacheControl: string): Record<string, string> => ({
  "Cache-Control": cacheControl,
});

const hasValidBearerSecret = (
  authorization: string | undefined,
  secret: string,
): boolean => authorization === `Bearer ${secret}`;

const readPostAudience = async (c: OidcContext): Promise<string> => {
  const body = await c.req.json<{ audience?: unknown }>();
  return typeof body.audience === "string" ? body.audience : "";
};

const readTokenAudience = async (c: OidcContext): Promise<string> => {
  if (c.req.method === "POST") {
    return readPostAudience(c);
  }

  return c.req.query("audience") ?? "";
};

export const oidcDiscoveryController = (c: OidcContext) => {
  try {
    return c.json(
      createOidcDiscoveryMetadata(c.env),
      200,
      jsonHeaders(OIDC_METADATA_CACHE_CONTROL),
    );
  } catch (error) {
    console.error(error);
    return c.json(
      createGenericTokenFailureResponse(),
      500,
      jsonHeaders(OIDC_TOKEN_CACHE_CONTROL),
    );
  }
};

export const oidcJwksController = async (c: OidcContext) => {
  try {
    return c.json(
      await createOidcJwks(c.env),
      200,
      jsonHeaders(OIDC_METADATA_CACHE_CONTROL),
    );
  } catch (error) {
    console.error(error);
    return c.json(
      createGenericTokenFailureResponse(),
      500,
      jsonHeaders(OIDC_TOKEN_CACHE_CONTROL),
    );
  }
};

export const oidcTokenController = async (c: OidcContext) => {
  const publicBearerSecret = c.env.PUBLIC_TOKEN_BEARER_SECRET?.trim();

  if (!publicBearerSecret) {
    console.error("Missing public token Bearer secret");
    return c.json(
      createGenericTokenFailureResponse(),
      500,
      jsonHeaders(OIDC_TOKEN_CACHE_CONTROL),
    );
  }

  if (!hasValidBearerSecret(c.req.header("authorization"), publicBearerSecret)) {
    return c.json(
      createTokenFailureResponse(
        OIDC_ERROR_CODES.unauthorized,
        OIDC_ERROR_MESSAGES.unauthorized,
      ),
      401,
      jsonHeaders(OIDC_TOKEN_CACHE_CONTROL),
    );
  }

  try {
    const audience = await readTokenAudience(c);

    return c.json(
      await issueOidcToken(c.env, { audience }),
      200,
      jsonHeaders(OIDC_TOKEN_CACHE_CONTROL),
    );
  } catch (error) {
    console.error(error);
    return c.json(
      createGenericTokenFailureResponse(),
      500,
      jsonHeaders(OIDC_TOKEN_CACHE_CONTROL),
    );
  }
};
