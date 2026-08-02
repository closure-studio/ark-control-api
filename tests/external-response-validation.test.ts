import { describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import { waitForZoneOperation } from "../src/services/gcp/compute";
import { downloadLatestPyHelperAsset } from "../src/services/pyhelper/github";
import { AiReviewParseResultSchema, AiReviewWithModelSchema } from "../src/schemas/apk-delivery/ai";
import { parseAiReviewJson } from "../src/utils/apk-delivery/ai";
import { normalizeWorkersAiTextResponse } from "../src/services/ai/provider-response";

describe("external response validation", () => {
  it("rejects malformed Google operation responses", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ status: 123 }), { status: 200 }));

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
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ assets: "invalid" }), { status: 200 }));

    await expect(
      downloadLatestPyHelperAsset({
        assetName: "Helper-arm64",
        token: "token",
        fetcher
      })
    ).rejects.toThrow("GitHub release API returned an invalid response");
  });

  it("rejects AI JSON with fields outside the declared protocol", () => {
    expect(parseAiReviewJson('{"status":"success","reason":"done","extra":true}')).toMatchObject({
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
        rawResponse: '{"status":"success"}',
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

  it("normalizes every supported Workers AI text response shape", () => {
    expect(normalizeWorkersAiTextResponse("direct response")).toEqual({
      status: "ok",
      text: "direct response"
    });
    expect(normalizeWorkersAiTextResponse({ output_text: "output text" })).toEqual({
      status: "ok",
      text: "output text"
    });
    expect(
      normalizeWorkersAiTextResponse({
        choices: [{ message: { content: "choice response" } }]
      })
    ).toEqual({ status: "ok", text: "choice response" });
  });

  it("distinguishes truncated, empty, and unsupported AI responses", () => {
    expect(
      normalizeWorkersAiTextResponse({ choices: [{ finish_reason: "length" }] })
    ).toMatchObject({ status: "error", reason: "AI response was truncated" });
    expect(normalizeWorkersAiTextResponse({ response: "" })).toMatchObject({
      status: "error",
      reason: "AI response did not include content"
    });
    expect(normalizeWorkersAiTextResponse(42)).toMatchObject({
      status: "error",
      reason: "AI response had an unsupported shape"
    });
  });
});
