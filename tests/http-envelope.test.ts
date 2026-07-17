import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import { jsonData, jsonError } from "../src/utils/http";

const app = new Hono<{ Bindings: Env }>();
app.get("/success", (c) => jsonData(c, { value: 42 }));
app.get("/failure", (c) =>
  jsonError(c, "bad_request", "The request is invalid.", 400, { field: "value" })
);

describe("API response envelope", () => {
  it("wraps successful JSON under data", async () => {
    const response = await app.request("/success");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { value: 42 } });
  });

  it("wraps failures in a stable machine-readable error", async () => {
    const response = await app.request("/failure");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "bad_request",
        message: "The request is invalid.",
        details: { field: "value" }
      }
    });
  });
});
