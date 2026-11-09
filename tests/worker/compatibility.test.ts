import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../../src/schemas/env";
import {
  advanceCompatibilityRuns,
  startApkCompatibility
} from "../../src/services/apk-delivery/compatibility";
import { compatibilityFetcher } from "../helpers/compatibility";

const bindings = env as Env & { TEST_D1_MIGRATIONS: { name: string; queries: string[] }[] };
const now = new Date("2026-10-31T17:30:00.000Z");

beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_D1_MIGRATIONS);
});

beforeEach(async () => {
  await bindings.DB.prepare("DELETE FROM arknights_apk_compatibility_runs").run();
});

describe("APK compatibility in Workers", () => {
  it.each([401, 403, 404, 422, 429, 408, 500, 503])(
    "handles dispatch HTTP %s without losing its cause or repeating the request",
    async (status) => {
      const requests: string[] = [];
      const messages: string[] = [];
      const fetcher: typeof fetch = async (input, init) => {
        const request = new Request(input, init);
        if (!request.url.startsWith("https://api.github.com/")) {
          messages.push(await request.text());
          return new Response(null, { status: 200 });
        }
        requests.push(request.url);
        return request.url.endsWith("/dispatches")
          ? new Response(null, { status })
          : Response.json({ workflow_runs: [] });
      };
      const testEnv = {
        ...bindings,
        COMPATIBILITY_GITHUB_TOKEN: "test-token",
        QQBOT_TOKEN: "qq-test",
        QQBOT_UID: "123"
      };
      const runtime = { fetcher, logger: { error: vi.fn() } };
      await startApkCompatibility(
        testEnv,
        runtime,
        "game.apk",
        "https://example.com/game.apk",
        now
      );
      const rejected = status < 500 && status !== 408;
      expect(
        (
          await bindings.DB.prepare(
            "SELECT status, error_message, next_check_at FROM arknights_apk_compatibility_runs"
          ).all()
        ).results
      ).toEqual([
        {
          status: rejected ? "failed" : "queued",
          error_message: `GitHub compatibility API returned HTTP ${status}`,
          next_check_at: rejected ? null : new Date(now.getTime() + 10 * 60_000).toISOString()
        }
      ]);
      expect(messages).toHaveLength(rejected ? 1 : 0);
      if (rejected) expect(messages[0]).toContain(`HTTP ${status}`);
      await advanceCompatibilityRuns(testEnv, runtime, new Date(now.getTime() + 10 * 60_000));
      expect(requests.filter((url) => url.endsWith("/dispatches"))).toHaveLength(1);
      expect(requests).toHaveLength(rejected ? 1 : 2);
    }
  );

  it("retries polling errors without treating them as dispatch rejections", async () => {
    const upstream = compatibilityFetcher(async () => new Response(null, { status: 404 }));
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      return request.url.includes("/actions/runs/")
        ? new Response(null, { status: 404 })
        : upstream(input, init);
    };
    const testEnv = { ...bindings, COMPATIBILITY_GITHUB_TOKEN: "test-token" };
    const runtime = { fetcher, logger: { error: vi.fn() } };
    await startApkCompatibility(testEnv, runtime, "game.apk", "https://example.com/game.apk", now);
    await advanceCompatibilityRuns(testEnv, runtime, new Date(now.getTime() + 10 * 60_000));
    expect(
      (
        await bindings.DB.prepare(
          "SELECT status, github_run_id, error_message FROM arknights_apk_compatibility_runs"
        ).all()
      ).results
    ).toEqual([
      {
        status: "queued",
        github_run_id: "1000",
        error_message: "GitHub compatibility API returned HTTP 404"
      }
    ]);
  });

  it("creates and dispatches a run with request options accepted by workerd", async () => {
    const upstream = compatibilityFetcher(async () => new Response(null, { status: 404 }));
    const requests: string[] = [];
    const messages: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      // Validate the real Workers Request before returning the mocked GitHub response.
      const request = new Request(input, init);
      if (!request.url.startsWith("https://api.github.com/")) {
        messages.push(await request.text());
        return new Response(null, { status: 200 });
      }
      requests.push(request.url);
      expect(request.url).not.toContain("/commits/");
      if (request.url.endsWith("/dispatches")) {
        expect(await request.json()).toEqual({
          ref: "greenfield",
          return_run_details: true,
          inputs: {
            job_id: expect.stringMatching(/^[0-9a-f]{64}$/),
            apk_filename: "arknights.apk",
            apk_url: "https://example.com/arknights.apk"
          }
        });
      }
      return upstream(input, init);
    };
    const logger = { error: vi.fn() };
    await startApkCompatibility(
      {
        ...bindings,
        COMPATIBILITY_GITHUB_TOKEN: "test-token",
        QQBOT_TOKEN: "qq-test",
        QQBOT_UID: "123"
      },
      { fetcher, logger },
      "arknights.apk",
      "https://example.com/arknights.apk",
      now
    );

    expect(
      (
        await bindings.DB.prepare(
          "SELECT status, github_run_id FROM arknights_apk_compatibility_runs"
        ).all()
      ).results
    ).toEqual([{ status: "passed", github_run_id: "1000" }]);
    await startApkCompatibility(
      { ...bindings, COMPATIBILITY_GITHUB_TOKEN: "test-token" },
      { fetcher, logger },
      "arknights.apk",
      "https://example.com/arknights.apk",
      now
    );
    expect(requests.filter((url) => url.endsWith("/dispatches"))).toHaveLength(1);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toContain("GitHub 兼容性工作流已通过");
    expect(messages[1]).toContain("https://github.com/ArkLikeDev/ArkHook/actions/runs/1000");
    expect(messages[1]).not.toContain("fast");
    expect(logger.error).not.toHaveBeenCalledWith(
      "GitHub compatibility submission failed; installation remains independent",
      expect.anything()
    );
  });

  it("rejects a GitHub redirect and logs its HTTP status", async () => {
    const fetcher: typeof fetch = async (input, init) => {
      new Request(input, init);
      return new Response(null, {
        status: 302,
        headers: { Location: "https://other.example.com/" }
      });
    };
    const logger = { error: vi.fn() };
    await startApkCompatibility(
      { ...bindings, COMPATIBILITY_GITHUB_TOKEN: "test-token" },
      { fetcher, logger },
      "redirect.apk",
      "https://example.com/redirect.apk",
      now
    );

    expect(logger.error).toHaveBeenCalledWith("GitHub compatibility check failed", {
      jobId: expect.any(String),
      error: "GitHub compatibility API returned HTTP 302"
    });
    expect(
      (
        await bindings.DB.prepare(
          "SELECT status, error_message FROM arknights_apk_compatibility_runs"
        ).all()
      ).results
    ).toEqual([{ status: "failed", error_message: "GitHub compatibility API returned HTTP 302" }]);
  });
});
