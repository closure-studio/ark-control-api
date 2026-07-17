import { describe, expect, it } from "vitest";
import { OIDC_ERROR_CODES } from "../src/constants/oidc";
import type { Env } from "../src/env";
import { oidcRouter, shouldHandleOidcRequest } from "../src/router/oidc";

const env = {
  OIDC_ISSUER: "https://issuer.example.com",
  PUBLIC_TOKEN_BEARER_SECRET: "token-secret"
} as Env;

describe("OIDC router", () => {
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
