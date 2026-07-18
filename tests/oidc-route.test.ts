import { describe, expect, it } from "vitest";
import { OIDC_ERROR_CODES } from "../src/constants/oidc";
import type { Env } from "../src/schemas/env";
import { OidcHealthResponseSchema } from "../src/schemas/health/responses";
import { oidcRouter, shouldHandleOidcRequest } from "../src/router/oidc";
import * as v from "valibot";

const env = {
  OIDC_ISSUER: "https://issuer.example.com",
  PUBLIC_TOKEN_BEARER_SECRET: "token-secret"
} as Env;

describe("OIDC router", () => {
  it("serves the Schema-defined health response", async () => {
    const response = await oidcRouter.request(
      "https://issuer.example.com/health",
      undefined,
      env
    );

    expect(response.status).toBe(200);
    expect(v.safeParse(OidcHealthResponseSchema, await response.json())).toMatchObject({
      success: true,
      output: { name: "ark-OIDC", status: "ok" }
    });
  });

  it("serves discovery metadata from the OIDC domain router", async () => {
    const response = await oidcRouter.request(
      "https://issuer.example.com/.well-known/openid-configuration",
      undefined,
      env
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      issuer: "https://issuer.example.com",
      jwks_uri: "https://issuer.example.com/jwks.json"
    });
  });

  it("protects token issuance with the configured bearer secret", async () => {
    const response = await oidcRouter.request(
      "https://issuer.example.com/token?audience=test",
      undefined,
      env
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: OIDC_ERROR_CODES.unauthorized,
      success: false
    });
  });

  it("returns the OIDC failure format for invalid token requests", async () => {
    const response = await oidcRouter.request(
      "https://issuer.example.com/token",
      undefined,
      env
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      version: 1,
      success: false,
      code: OIDC_ERROR_CODES.invalidRequest,
      message: "Invalid request"
    });
  });

  it("routes only OIDC paths on the issuer host", () => {
    expect(
      shouldHandleOidcRequest(
        new Request("https://issuer.example.com/.well-known/openid-configuration"),
        env
      )
    ).toBe(true);
    expect(shouldHandleOidcRequest(new Request("https://issuer.example.com/api/dashboard"), env)).toBe(false);
  });
});
