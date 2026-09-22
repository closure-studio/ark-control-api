import { env } from "cloudflare:workers";
import { applyD1Migrations, runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { collectPublicAnnouncements } from "../../src/services/public-announcements/collector";
import { getPublicAnnouncements } from "../../src/controller/public-announcements";
import { api } from "../../src/index";
import { saveSnapshot } from "../../src/repositories/public-announcements";
import type { Env } from "../../src/schemas/env";
import type { ControlJobAlarm } from "../../src/services/scheduler/control-job-alarm";

const bindings = env as Omit<Env, "CONTROL_JOB_ALARMS"> & {
  TEST_D1_MIGRATIONS: { name: string; queries: string[] }[];
  CONTROL_JOB_ALARMS: DurableObjectNamespace<ControlJobAlarm>;
};
beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_D1_MIGRATIONS);
});
beforeEach(async () => {
  await bindings.DB.prepare("DELETE FROM public_announcement_snapshot").run();
});
const now = new Date("2026-09-19T00:00:00Z");
const html = (end: string) =>
  `<h1>闪断更新</h1><article><p>2026年09月20日16:00至${end}</p><p>新增时装</p></article>`;
function source(detail: string, ids = ["001"]): typeof fetch {
  return async (input) =>
    String(input).includes("/api/news")
      ? Response.json({ code: 0, data: { list: ids.map((cid) => ({ cid })), end: true } })
      : new Response(detail);
}

describe("public collection and D1 projection", () => {
  it("returns unavailable before collection and never opens management writes", async () => {
    const response = await api.request("/public/announcements", {}, bindings);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "unavailable", events: [] });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect((await api.request("/public/announcements", { method: "POST" }, bindings)).status).toBe(
      404
    );
    expect((await api.request("/api/vps", {}, bindings)).status).toBe(401);
  });
  it("updates same IDs, retains failed old data and retries successfully", async () => {
    await collectPublicAnnouncements(bindings.DB, { fetcher: source(html("16:10")), now });
    let snapshot = await getPublicAnnouncements(bindings.DB, now);
    expect(snapshot.status).toBe("ready");
    expect(snapshot.events[0]?.newsId).toBe("001");
    expect(snapshot.events[0]?.windows[0]?.endAt).toBe("2026-09-20T16:10:00+08:00");
    await collectPublicAnnouncements(bindings.DB, { fetcher: source(html("16:20")), now });
    snapshot = await getPublicAnnouncements(bindings.DB, now);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]?.windows[0]?.endAt).toBe("2026-09-20T16:20:00+08:00");
    await collectPublicAnnouncements(bindings.DB, {
      fetcher: async () => new Response(null, { status: 503 }),
      now
    });
    expect(await getPublicAnnouncements(bindings.DB, now)).toMatchObject({
      status: "ready",
      errorCode: null,
      events: [{ newsId: "001" }]
    });
    await collectPublicAnnouncements(bindings.DB, { fetcher: source(html("16:20")), now });
    expect((await getPublicAnnouncements(bindings.DB, now)).status).toBe("ready");
    expect(
      (await getPublicAnnouncements(bindings.DB, new Date(now.getTime() + 46_800_001))).status
    ).toBe("stale");
    const response = await api.request("/public/announcements", {}, bindings);
    expect(Object.keys((await response.json()) as object).sort()).toEqual([
      "errorCode",
      "events",
      "generatedAt",
      "lastAttemptAt",
      "lastSuccessAt",
      "schemaVersion",
      "status"
    ]);
  });
  it("distinguishes a successful empty list and caps detail requests", async () => {
    await collectPublicAnnouncements(bindings.DB, { fetcher: source(html("16:10"), []), now });
    expect((await getPublicAnnouncements(bindings.DB, now)).status).toBe("ready");
    let detailCalls = 0;
    const many = Array.from({ length: 30 }, (_, i) => String(i + 100));
    await collectPublicAnnouncements(bindings.DB, {
      now,
      fetcher: async (input) => {
        if (String(input).includes("/api/news"))
          return Response.json({
            code: 0,
            data: { list: many.map((cid) => ({ cid })), end: true }
          });
        detailCalls++;
        return new Response(html("16:10"));
      }
    });
    expect(detailCalls).toBeLessThanOrEqual(20);
    expect((await getPublicAnnouncements(bindings.DB, now)).status).toBe("ready");
  });
  it("handles timeout, oversize details and partial failure without losing old records", async () => {
    await collectPublicAnnouncements(bindings.DB, { fetcher: source(html("16:10")), now });
    await collectPublicAnnouncements(bindings.DB, {
      now,
      timeoutMs: 1,
      fetcher: async (_input, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("timeout")))
        )
    });
    expect((await getPublicAnnouncements(bindings.DB, now)).status).toBe("ready");
    await collectPublicAnnouncements(bindings.DB, {
      now,
      fetcher: source("x".repeat(1024 * 1024 + 1))
    });
    expect((await getPublicAnnouncements(bindings.DB, now)).errorCode).toBeNull();
    expect((await getPublicAnnouncements(bindings.DB, now)).events.length).toBeGreaterThan(0);
  });
  it("stops on 429 and allows the next independent collection", async () => {
    let calls = 0;
    const next = await collectPublicAnnouncements(bindings.DB, {
      now,
      fetcher: async () => {
        calls++;
        return new Response(null, { status: 429, headers: { "Retry-After": "10800" } });
      }
    });
    expect(calls).toBe(1);
    expect(next.toISOString()).toBe("2026-09-19T12:00:00.000Z");
    expect((await getPublicAnnouncements(bindings.DB, now)).status).toBe("unavailable");
    await collectPublicAnnouncements(bindings.DB, { now: next, fetcher: source(html("16:10")) });
    expect((await getPublicAnnouncements(bindings.DB, next)).status).toBe("ready");
  });
  it("rechecks active events missing from the latest list and retains them on failure", async () => {
    await collectPublicAnnouncements(bindings.DB, { now, fetcher: source(html("16:10")) });
    let detailCalls = 0;
    await collectPublicAnnouncements(bindings.DB, {
      now,
      fetcher: async (input) => {
        if (String(input).includes("/api/news"))
          return Response.json({ code: 0, data: { list: [], end: true } });
        detailCalls++;
        return new Response(null, { status: 503 });
      }
    });
    expect(detailCalls).toBe(1);
    expect((await getPublicAnnouncements(bindings.DB, now)).events[0]?.newsId).toBe("001");
  });
  it("refuses oversized snapshots without replacing the previous data", async () => {
    await collectPublicAnnouncements(bindings.DB, { now, fetcher: source(html("16:10")) });
    const snapshot = await getPublicAnnouncements(bindings.DB, now);
    const event = snapshot.events[0]!;
    await expect(
      saveSnapshot(
        bindings.DB,
        Array.from({ length: 101 }, () => event),
        now
      )
    ).rejects.toThrow();
    expect((await getPublicAnnouncements(bindings.DB, now)).events).toEqual(snapshot.events);
  });
  it("does not present the migration sentinel as a real collection time", async () => {
    await collectPublicAnnouncements(bindings.DB, { now, fetcher: source(html("16:10")) });
    await bindings.DB.prepare(
      "UPDATE public_announcement_snapshot SET collected_at = '1970-01-01T00:00:00.000Z'"
    ).run();
    expect(await getPublicAnnouncements(bindings.DB, now)).toMatchObject({
      status: "stale",
      lastSuccessAt: null,
      events: [{ newsId: "001" }]
    });
  });
  it("bounds legacy snapshot projection without discarding stored events", async () => {
    await collectPublicAnnouncements(bindings.DB, { now, fetcher: source(html("16:10")) });
    const event = (await getPublicAnnouncements(bindings.DB, now)).events[0]!;
    const window = { ...event.windows[0]!, rawTimeText: "证据".repeat(1000) };
    const events = Array.from({ length: 101 }, (_, index) => ({
      ...event,
      newsId: String(index),
      windows: [window, window]
    }));
    await bindings.DB.prepare("UPDATE public_announcement_snapshot SET events_json = ?")
      .bind(JSON.stringify(events))
      .run();
    const snapshot = await getPublicAnnouncements(bindings.DB, now);
    expect(snapshot.status).toBe("partial");
    expect(snapshot.errorCode).toBe("limit_reached");
    expect(snapshot.events.length).toBeGreaterThan(0);
    expect(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength).toBeLessThan(1024 * 1024);
    expect(
      await bindings.DB.prepare(
        "SELECT json_array_length(events_json) AS count FROM public_announcement_snapshot"
      ).first("count")
    ).toBe(101);
  });
  it("rechecks an uncertain deadline even when the old date is in the past", async () => {
    const event = {
      newsId: "001",
      sourceUrl: "https://ak.hypergryph.com/news/001",
      title: "活动",
      publishedAt: null,
      fetchedAt: now.toISOString(),
      windows: [
        {
          kind: "activity" as const,
          sectionLabel: "延期",
          startAt: null,
          endAt: "2026-09-18T00:00:00Z",
          timezone: "Asia/Shanghai" as const,
          rawTimeText: "延期待定",
          parseStatus: "pending" as const
        }
      ]
    };
    await saveSnapshot(bindings.DB, [event], now);
    let detailCalls = 0;
    await collectPublicAnnouncements(bindings.DB, {
      now,
      fetcher: async (input) => {
        if (String(input).includes("/api/news"))
          return Response.json({ code: 0, data: { list: [], end: true } });
        detailCalls++;
        return new Response("<h1>活动延期</h1><article><p>时间另行通知</p></article>");
      }
    });
    expect(detailCalls).toBe(1);
    expect(
      (await getPublicAnnouncements(bindings.DB, now)).events[0]?.windows[0]?.parseStatus
    ).toBe("pending");
  });
  it("runs only public reads from its alarm and recovers scheduling on failure", async () => {
    const stub = bindings.CONTROL_JOB_ALARMS.getByName("public-announcements");
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(source(html("16:10")));
    try {
      await runInDurableObject(stub, async (instance) => {
        await instance.alarm();
      });
      expect(fetcher).toHaveBeenCalled();
      expect(
        fetcher.mock.calls.every(
          ([input, init]) =>
            String(input).startsWith("https://ak.hypergryph.com/") &&
            (!init?.method || init.method === "GET")
        )
      ).toBe(true);
      expect(
        await bindings.DB.prepare(
          "SELECT count(*) AS count FROM arknights_maintenance_announcements"
        ).first("count")
      ).toBe(0);
      await runInDurableObject(stub, async (instance) => {
        Object.defineProperty(instance, "runJob", {
          configurable: true,
          value: () => Promise.reject(new Error("simulated storage failure"))
        });
        await instance.alarm({ scheduledTime: Date.now(), retryCount: 6, isRetry: true });
      });
      expect(
        await runInDurableObject(stub, async (_instance, state) => state.storage.getAlarm())
      ).toBeGreaterThanOrEqual(Date.now() + 299_000);
    } finally {
      fetcher.mockRestore();
    }
  });
  it("registers a separate alarm with half-day scheduling", async () => {
    const stub = bindings.CONTROL_JOB_ALARMS.getByName("public-announcements");
    expect((await stub.fetch("https://local/ensure", { method: "POST" })).status).toBe(204);
    expect(
      await runInDurableObject(stub, async (_instance, state) => state.storage.getAlarm())
    ).not.toBeNull();
  });
});
