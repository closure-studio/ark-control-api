import { describe, expect, it } from "vitest";
import { api } from "../src/index";
import type { Env } from "../src/env";

describe("control API health", () => {
  it("returns the merged service identity", async () => {
    const response = await api.request("https://control.example.com/health", undefined, {} as Env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, service: "ark-control-api" });
  });

  it("protects the unified control routes with the admin token", async () => {
    const response = await api.request(
      "https://control.example.com/api/dashboard",
      undefined,
      { ADMIN_TOKEN: "secret" } as Env
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized", message: "Unauthorized" });
  });
});
