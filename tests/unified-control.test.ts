import { describe, expect, it, vi } from "vitest";
import { waitForZoneOperation } from "../src/services/gcp/compute";

describe("unified control services", () => {
  it("waits for a completed Google operation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "RUNNING" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "DONE" }), { status: 200 }));

    await expect(
      waitForZoneOperation({
        fetcher,
        accessToken: "token",
        projectId: "project-a",
        zone: "us-central1-a",
        operationName: "operation-1",
        maxAttempts: 2,
        delayMs: 0
      })
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails when a Google operation never completes", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        new Response(JSON.stringify({ status: "RUNNING" }), { status: 200 })
      );

    await expect(
      waitForZoneOperation({
        fetcher,
        accessToken: "token",
        projectId: "project-a",
        zone: "us-central1-a",
        operationName: "operation-1",
        maxAttempts: 2,
        delayMs: 0
      })
    ).rejects.toThrow("did not finish in time");
  });
});
