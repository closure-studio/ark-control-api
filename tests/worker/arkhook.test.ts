import { Buffer } from "node:buffer";
import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../../src";
import { MAX_FAILURE_REQUEST_BYTES, TASK_FAILURES_PATH } from "../../src/constants/arkhook/config";
import type { Env } from "../../src/schemas/env";
import { failureRecord, TASK_ID } from "../helpers/arkhook";

const bindings = env as Env & { TEST_D1_MIGRATIONS: { name: string; queries: string[] }[] };
const configured = {
  ...bindings,
  ADMIN_TOKEN: "admin-secret",
  ARKHOOK_UPLOAD_TOKEN: "upload-secret"
};
const admin = { authorization: "Bearer admin-secret" };
const uploader = { authorization: "Bearer upload-secret", "content-type": "application/json" };
function upload(record: unknown = failureRecord()) {
  return api.request(
    TASK_FAILURES_PATH,
    { method: "POST", headers: uploader, body: JSON.stringify(record) },
    configured
  );
}
beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_D1_MIGRATIONS);
});
beforeEach(async () => {
  await bindings.DB.prepare("DELETE FROM arkhook_task_failures").run();
});

describe("ArkHook HTTP to D1 archive", () => {
  it("stores exactly five columns, round-trips all JSON and updates one row on retries", async () => {
    const record = failureRecord();
    for (let i = 0; i < 2; i++) {
      const response = await upload(record);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: { task_id: TASK_ID } });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    record.completion.task_err = "later remote conflict";
    record.stageId = null;
    expect((await upload(record)).status).toBe(200);
    expect(
      await bindings.DB.prepare("SELECT COUNT(*) AS total FROM arkhook_task_failures").first(
        "total"
      )
    ).toBe(1);
    const row = await bindings.DB.prepare("SELECT * FROM arkhook_task_failures WHERE task_id = ?")
      .bind(TASK_ID)
      .first();
    expect(Object.keys(row ?? {})).toEqual([
      "task_id",
      "stage_id",
      "battle_rank",
      "recorded_at",
      "record_json"
    ]);
    expect(row).toMatchObject({ stage_id: null, battle_rank: 1, recorded_at: record.recordedAt });
    expect(
      await bindings.DB.prepare(
        "SELECT typeof(record_json) AS kind FROM arkhook_task_failures"
      ).first("kind")
    ).toBe("blob");
    const detail = await api.request(
      TASK_FAILURES_PATH + "/" + TASK_ID,
      { headers: admin },
      configured
    );
    expect(detail.status).toBe(200);
    expect(detail.headers.get("cache-control")).toBe("no-store");
    expect(await detail.json()).toEqual({ data: record });
  });
  it("separates upload credentials from admin reads and all other management APIs", async () => {
    for (const authorization of [undefined, "Bearer admin-secret", "Bearer wrong"]) {
      const headers = {
        "content-type": "application/json",
        ...(authorization ? { authorization } : {})
      };
      expect(
        (
          await api.request(
            TASK_FAILURES_PATH,
            { method: "POST", headers, body: JSON.stringify(failureRecord()) },
            configured
          )
        ).status
      ).toBe(401);
    }
    for (const path of [
      TASK_FAILURES_PATH,
      TASK_FAILURES_PATH + "/" + TASK_ID,
      "/api/vps",
      "/api/accounts"
    ]) {
      expect((await api.request(path, { headers: uploader }, configured)).status).toBe(401);
    }
    for (const token of [undefined, ""]) {
      const missing = {
        ...bindings,
        ADMIN_TOKEN: "admin-secret",
        ...(token === undefined ? {} : { ARKHOOK_UPLOAD_TOKEN: token })
      };
      // bindings has no configured upload credential.
      delete missing.ARKHOOK_UPLOAD_TOKEN;
      if (token !== undefined) missing.ARKHOOK_UPLOAD_TOKEN = token;
      expect(
        (
          await api.request(
            TASK_FAILURES_PATH,
            { method: "POST", headers: uploader, body: "{}" },
            missing
          )
        ).status
      ).toBe(401);
    }
    expect(
      (await api.request(TASK_FAILURES_PATH, { method: "DELETE", headers: uploader }, configured))
        .status
    ).toBe(401);
    expect(
      (
        await api.request(
          TASK_FAILURES_PATH + "/",
          { method: "POST", headers: uploader },
          configured
        )
      ).status
    ).toBe(401);
  });
  it("filters and paginates summaries without transferring large record JSON", async () => {
    const a = failureRecord();
    const b = failureRecord("8531aece-1234-4567-89ab-123456789abd");
    const c = failureRecord("8531aece-1234-4567-89ab-123456789abe");
    b.recordedAt += 1;
    b.battleRank = 2;
    c.recordedAt += 2;
    c.stageId = "other";
    for (const record of [a, b, c]) expect((await upload(record)).status).toBe(200);
    const query = async (suffix: string) => {
      const response = await api.request(
        TASK_FAILURES_PATH + suffix,
        { headers: admin },
        configured
      );
      expect(response.status).toBe(200);
      return response.json();
    };
    expect(await query("?stage_id=act52side_08&limit=1&offset=1")).toEqual({
      data: {
        records: [
          { task_id: TASK_ID, stage_id: a.stageId, battle_rank: 1, recorded_at: a.recordedAt }
        ],
        pagination: { limit: 1, offset: 1, count: 1, total: 2 }
      }
    });
    expect(
      await query("?battle_rank=2&recorded_from=" + b.recordedAt + "&recorded_to=" + b.recordedAt)
    ).toMatchObject({ data: { records: [{ task_id: b.task.task_id }], pagination: { total: 1 } } });
    expect(await query("?limit=0")).toMatchObject({
      data: { records: [], pagination: { total: 3 } }
    });
    expect(await query("?stage_id=absent")).toMatchObject({
      data: { records: [], pagination: { total: 0 } }
    });
  });
  it("returns stable errors for missing tasks, invalid records, malformed JSON and filters", async () => {
    expect(
      (await api.request(TASK_FAILURES_PATH + "/" + TASK_ID, { headers: admin }, configured)).status
    ).toBe(404);
    for (const path of [
      TASK_FAILURES_PATH + "/invalid",
      TASK_FAILURES_PATH + "?battle_rank=4",
      TASK_FAILURES_PATH + "?recorded_from=2&recorded_to=1"
    ]) {
      const response = await api.request(path, { headers: admin }, configured);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "bad_request" } });
    }
    expect((await upload({ ...failureRecord(), version: 2 })).status).toBe(400);
    const malformed = await api.request(
      TASK_FAILURES_PATH,
      { method: "POST", headers: uploader, body: "{" },
      configured
    );
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toHaveProperty("error.code");
    expect(
      await bindings.DB.prepare("SELECT COUNT(*) AS total FROM arkhook_task_failures").first(
        "total"
      )
    ).toBe(0);
  });
  it("accepts JSON above 2 MB, stores compressed BLOBs, and returns complete Unicode JSON", async () => {
    const record = failureRecord();
    record.task.task_data.payload = "中".repeat(700_000);
    expect((await upload(record)).status).toBe(200);
    const storedBytes = await bindings.DB.prepare(
      "SELECT length(record_json) AS size FROM arkhook_task_failures"
    ).first<number>("size");
    expect(storedBytes).toBeLessThan(2000);
    const detail = await api.request(
      TASK_FAILURES_PATH + "/" + TASK_ID,
      { headers: admin },
      configured
    );
    expect(await detail.json()).toEqual({ data: record });
  }, 20_000);
  it("rejects oversized raw JSON and streamed bodies before replacing existing data", async () => {
    expect((await upload()).status).toBe(200);
    const record = failureRecord();
    record.task.task_data.payload = "中".repeat(2_700_000);
    const oversized = await upload(record);
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({ error: { code: "payload_too_large" } });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_FAILURE_REQUEST_BYTES + 1));
        controller.close();
      }
    });
    const request = new Request("https://test" + TASK_FAILURES_PATH, {
      method: "POST",
      headers: uploader,
      body: stream
    });
    const limited = await api.fetch(request, configured);
    expect(limited.status).toBe(413);
    expect(await limited.json()).toMatchObject({ error: { code: "payload_too_large" } });
    const detail = await api.request(
      TASK_FAILURES_PATH + "/" + TASK_ID,
      { headers: admin },
      configured
    );
    expect(await detail.json()).toEqual({ data: failureRecord() });
  }, 20_000);
  it("rejects an incompressible record that still exceeds the D1 storage budget", async () => {
    const random = new Uint8Array(2_000_000);
    for (let i = 0; i < random.length; i += 65536)
      crypto.getRandomValues(random.subarray(i, i + 65536));
    const record = failureRecord();
    record.task.task_data.payload = Buffer.from(random).toString("base64");
    const response = await upload(record);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "payload_too_large" } });
    expect(
      await bindings.DB.prepare("SELECT COUNT(*) AS total FROM arkhook_task_failures").first(
        "total"
      )
    ).toBe(0);
  }, 30_000);
});
