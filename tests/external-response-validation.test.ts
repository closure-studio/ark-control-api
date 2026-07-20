import { describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import { waitForZoneOperation } from "../src/services/gcp/compute";
import { downloadLatestPyHelperAsset } from "../src/services/pyhelper/github";
import { createTaskServerClient } from "../src/services/task-server/client";
import {
  AiReviewParseResultSchema,
  AiReviewWithModelSchema
} from "../src/schemas/apk-delivery/ai";
import { parseAiReviewJson } from "../src/utils/apk-delivery/ai";

describe("external response validation", () => {
  it("rejects malformed Google operation responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 123 }), { status: 200 })
    );

    await expect(
      waitForZoneOperation({
        fetcher,
        accessToken: "token",
        projectId: "project-a",
        zone: "us-central1-a",
        operationName: "operation-1",
        maxAttempts: 1
      })
    ).rejects.toThrow("Google API returned an invalid response");
  });

  it("rejects malformed GitHub release responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ assets: "invalid" }), { status: 200 })
    );

    await expect(
      downloadLatestPyHelperAsset({
        assetName: "Helper-arm64",
        token: "token",
        fetcher
      })
    ).rejects.toThrow("GitHub release API returned an invalid response");
  });

  it("validates Task Server endpoint data instead of trusting the envelope", async () => {
    const client = createTaskServerClient(
      {
        TASK_SERVER_BASE_URL: "https://tasks.example.com",
        TASK_SERVER_AUTHORIZATION: "Bearer token"
      },
      {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(
          new Response(JSON.stringify({ errCode: 0, msg: "ok", data: "not-an-index" }))
        )
      }
    );

    await expect(
      client.getIndex({ taskId: "task-1", queue: "shot" })
    ).rejects.toThrow("invalid response envelope");
  });

  it("preserves valid JSON extension fields in Task Server payloads", async () => {
    const task = {
      task_id: "task-1",
      needScreenshot: true,
      task_status: 1,
      expires: 2,
      not_before: 0,
      metadata: { labels: ["one", "two"] }
    };
    const client = createTaskServerClient(
      {
        TASK_SERVER_BASE_URL: "https://tasks.example.com",
        TASK_SERVER_AUTHORIZATION: "Bearer token"
      },
      {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(
          new Response(
            JSON.stringify({ errCode: 0, msg: "ok", data: JSON.stringify(task) })
          )
        )
      }
    );

    await expect(client.getTask({ taskId: "task-1" })).resolves.toEqual(task);
  });

  it("rejects AI JSON with fields outside the declared protocol", () => {
    expect(
      parseAiReviewJson('{"status":"success","reason":"done","extra":true}')
    ).toMatchObject({
      status: "unknown",
      protocolError: true,
      reason: "AI response had unexpected fields"
    });
  });

  it("validates normalized AI review contracts from their Schemas", () => {
    expect(
      v.safeParse(AiReviewParseResultSchema, {
        status: "success",
        reason: "done",
        rawResponse: "{\"status\":\"success\"}",
        protocolError: false
      })
    ).toMatchObject({ success: true });
    expect(
      v.safeParse(AiReviewWithModelSchema, {
        status: "success",
        reason: "done",
        rawResponse: "{}",
        protocolError: false,
        model: "model-a"
      })
    ).toMatchObject({ success: true });
    expect(
      v.safeParse(AiReviewParseResultSchema, {
        status: "success",
        reason: "done",
        rawResponse: "{}",
        protocolError: "false"
      }).success
    ).toBe(false);
  });
});
