import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../../src/schemas/env";
import { startApkCompatibility } from "../../src/services/apk-delivery/compatibility";
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
  it("creates and dispatches a run with request options accepted by workerd", async () => {
    const upstream = compatibilityFetcher(async () => new Response(null, { status: 404 }));
    const fetcher: typeof fetch = async (input, init) => {
      // Validate the real Workers Request before returning the mocked GitHub response.
      new Request(input, init);
      return upstream(input, init);
    };
    const logger = { error: vi.fn() };
    await startApkCompatibility(
      { ...bindings, COMPATIBILITY_GITHUB_TOKEN: "test-token" },
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

    expect(logger.error).toHaveBeenCalledWith(
      "GitHub compatibility submission failed; installation remains independent",
      { apkFilename: "redirect.apk", error: "GitHub compatibility API returned HTTP 302" }
    );
    expect(
      (await bindings.DB.prepare("SELECT id FROM arknights_apk_compatibility_runs").all()).results
    ).toEqual([]);
  });
});
