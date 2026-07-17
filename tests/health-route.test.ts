import { describe, expect, it } from "vitest";
import { API_ERROR_CODES } from "../src/constants/api/error-codes";
import { api } from "../src/index";
import type { Env } from "../src/types/env";

describe("control API health", () => {
  it("returns the merged service identity", async () => {
    const response = await api.request("https://control.example.com/health", undefined, {} as Env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, service: "ark-control-api" });
  });

  it("returns root not-found responses from the root router", async () => {
    const response = await api.request("https://control.example.com/missing", undefined, {} as Env);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: API_ERROR_CODES.NOT_FOUND });
  });

  it("protects the unified control routes with the admin token", async () => {
    const response = await api.request(
      "https://control.example.com/api/dashboard",
      undefined,
      { ADMIN_TOKEN: "secret" } as Env
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: API_ERROR_CODES.UNAUTHORIZED, message: "Unauthorized" }
    });
  });

  it("protects machine account registration with the admin token", async () => {
    const response = await api.request(
      "https://control.example.com/api/public/accounts",
      { method: "POST", body: "{}", headers: { "content-type": "application/json" } },
      { ADMIN_TOKEN: "secret" } as Env
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: API_ERROR_CODES.UNAUTHORIZED, message: "Unauthorized" }
    });
  });

  it("rejects missing registration fields before controller execution", async () => {
    const response = await api.request(
      "https://control.example.com/api/public/accounts",
      {
        method: "POST",
        body: "{}",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json"
        }
      },
      { ADMIN_TOKEN: "secret" } as Env
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: API_ERROR_CODES.BAD_REQUEST }
    });
  });

  it("rejects non-object JSON request bodies before controller execution", async () => {
    const response = await api.request(
      "https://control.example.com/api/public/accounts",
      {
        method: "POST",
        body: "[]",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json"
        }
      },
      { ADMIN_TOKEN: "secret" } as Env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: API_ERROR_CODES.BAD_REQUEST, message: "Request body must be an object." }
    });
  });

  it("rejects invalid field types before controller execution", async () => {
    const response = await api.request(
      "https://control.example.com/api/public/accounts",
      {
        method: "POST",
        body: JSON.stringify({ projectId: 123 }),
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json"
        }
      },
      { ADMIN_TOKEN: "secret" } as Env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: API_ERROR_CODES.BAD_REQUEST }
    });
  });
});
