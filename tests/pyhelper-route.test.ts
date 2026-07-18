import { describe, expect, it } from "vitest";

import { API_ERROR_CODES } from "../src/constants/api/error-codes";
import { api } from "../src/index";
import type { Env } from "../src/schemas/env";
import * as v from "valibot";
import {
  PyHelperDownloadQuerySchema
} from "../src/schemas/pyhelper/download";
import {
  createPyHelperDownloadUrl,
  verifyPyHelperDownloadRequest
} from "../src/services/pyhelper/download-url";

describe("PyHelper download validation", () => {
  it("rejects missing signed download query parameters", async () => {
    const response = await api.request(
      "https://control.example.com/api/pyhelper/assets/Helper-arm64",
      undefined,
      {} as Env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: API_ERROR_CODES.BAD_REQUEST }
    });
  });

  it("rejects non-numeric expiration before signature verification", async () => {
    const response = await api.request(
      "https://control.example.com/api/pyhelper/assets/Helper-arm64?expires=invalid&signature=test",
      undefined,
      {} as Env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: API_ERROR_CODES.BAD_REQUEST }
    });
  });

  it("verifies a generated URL through the normalized query contract", async () => {
    const url = await createPyHelperDownloadUrl({
      assetName: "Helper-arm64",
      baseUrl: "https://control.example.com",
      token: "download-secret",
      now: () => 1_000,
      ttlSeconds: 60
    });
    const queryResult = v.safeParse(
      PyHelperDownloadQuerySchema,
      Object.fromEntries(url.searchParams.entries())
    );

    expect(queryResult.success).toBe(true);
    if (!queryResult.success) return;
    await expect(
      verifyPyHelperDownloadRequest({
        assetName: "Helper-arm64",
        ...queryResult.output,
        token: "download-secret",
        now: () => 1_000
      })
    ).resolves.toBeUndefined();
  });
});
