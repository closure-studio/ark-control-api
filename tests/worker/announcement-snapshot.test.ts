import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  collectPublicAnnouncements,
  nextPublicAnnouncementAlarm
} from "../../src/services/public-announcements/collector";
import { getPublicAnnouncements } from "../../src/controller/public-announcements";
import type { Env } from "../../src/schemas/env";

const bindings = env as Env & { TEST_D1_MIGRATIONS: { name: string; queries: string[] }[] };
const now = new Date("2026-09-22T00:00:00Z");
beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_D1_MIGRATIONS);
});
beforeEach(async () => {
  await bindings.DB.prepare("DELETE FROM public_announcement_snapshot").run();
});
const detail = (minute: string) =>
  `<h1>闪断更新</h1><article><p>2026年09月23日16:00至16:${minute}</p></article>`;
function source(ids: string[], fail = false): typeof fetch {
  return async (input) =>
    String(input).includes("/api/news")
      ? Response.json({ code: 0, data: { list: ids.map((cid) => ({ cid })), end: true } })
      : fail && String(input).endsWith("/2")
        ? new Response(null, { status: 503 })
        : new Response(detail("20"));
}
it("keeps the complete previous snapshot when a later detail fails", async () => {
  await collectPublicAnnouncements(bindings.DB, { now, fetcher: source(["1"]) });
  const before = await getPublicAnnouncements(bindings.DB, now);
  await collectPublicAnnouncements(bindings.DB, {
    now: new Date("2026-09-22T12:00:00Z"),
    fetcher: source(["1", "2"], true)
  });
  const after = await getPublicAnnouncements(bindings.DB, now);
  expect(after.events).toEqual(before.events);
  expect(after.lastSuccessAt).toBe(before.lastSuccessAt);
  expect(after.lastAttemptAt).toBeNull();
  expect(after.status).toBe("ready");
});
it("uses half-day boundaries after rate limits without a persisted retry deadline", async () => {
  const next = await collectPublicAnnouncements(bindings.DB, {
    now,
    fetcher: async () => new Response(null, { status: 429, headers: { "Retry-After": "86400" } })
  });
  expect(next.toISOString()).toBe("2026-09-22T12:00:00.000Z");
  expect(nextPublicAnnouncementAlarm(new Date("2026-09-22T12:00:00Z")).toISOString()).toBe(
    "2026-09-23T00:00:00.000Z"
  );
  await collectPublicAnnouncements(bindings.DB, {
    now: new Date("2026-09-22T12:00:00Z"),
    fetcher: source([])
  });
  expect((await getPublicAnnouncements(bindings.DB, new Date("2026-09-22T12:00:00Z"))).status).toBe(
    "ready"
  );
});
it("summarizes unresolved sections through AI without certifying invented dates", async () => {
  const ai = vi.spyOn(bindings.AI, "run").mockResolvedValue({
    response: JSON.stringify({ summaries: [{ index: 0, summary: "活动开放时间另行通知" }] })
  });
  try {
    await collectPublicAnnouncements(bindings.DB, {
      now,
      ai: bindings,
      fetcher: async (input) =>
        String(input).includes("/api/news")
          ? Response.json({ code: 0, data: { list: [{ cid: "1" }], end: true } })
          : new Response("<h1>活动预告</h1><article><p>时间另行通知</p></article>")
    });
    const snapshot = await getPublicAnnouncements(bindings.DB, now);
    expect(snapshot.events[0]?.windows[0]).toMatchObject({
      sectionLabel: "活动开放时间另行通知",
      startAt: null,
      endAt: null,
      parseStatus: "pending",
      rawTimeText: "时间另行通知"
    });
    expect(snapshot.status).toBe("partial");
    expect(ai).toHaveBeenCalledTimes(1);
  } finally {
    ai.mockRestore();
  }
});

it.each([
  { name: "invalid JSON", response: { response: "not json" } },
  {
    name: "out of range index",
    response: { response: '{"summaries":[{"index":9,"summary":"wrong"}]}' }
  },
  {
    name: "duplicate indexes",
    response: {
      response: '{"summaries":[{"index":0,"summary":"first"},{"index":0,"summary":"second"}]}'
    }
  }
])("preserves evidence when AI returns $name", async ({ response }) => {
  const ai = vi.spyOn(bindings.AI, "run").mockResolvedValue(response);
  try {
    await collectPublicAnnouncements(bindings.DB, {
      now,
      ai: bindings,
      fetcher: async (input) =>
        String(input).includes("/api/news")
          ? Response.json({ code: 0, data: { list: [{ cid: "1" }], end: true } })
          : new Response("<h1>活动预告</h1><article><p>时间另行通知</p></article>")
    });
    expect((await getPublicAnnouncements(bindings.DB, now)).events[0]?.windows[0]).toMatchObject({
      sectionLabel: "时间另行通知",
      rawTimeText: "时间另行通知",
      parseStatus: "pending",
      startAt: null,
      endAt: null
    });
  } finally {
    ai.mockRestore();
  }
});
it.each(["error", "timeout"])("retains pending text on AI %s", async (mode) => {
  const ai = vi.spyOn(bindings.AI, "run").mockImplementation(async () => {
    if (mode === "error") throw new Error("AI unavailable");
    return new Promise(() => {
      /* Intentionally unresolved provider response exercises the timeout. */
    });
  });
  try {
    await collectPublicAnnouncements(bindings.DB, {
      now,
      ai: bindings,
      aiTimeoutMs: 1,
      fetcher: async (input) =>
        String(input).includes("/api/news")
          ? Response.json({ code: 0, data: { list: [{ cid: "1" }], end: true } })
          : new Response("<h1>活动预告</h1><article><p>时间另行通知</p></article>")
    });
    expect(
      (await getPublicAnnouncements(bindings.DB, now)).events[0]?.windows[0]?.sectionLabel
    ).toBe("时间另行通知");
  } finally {
    ai.mockRestore();
  }
});
it("skips AI for complete rules and removes expired events after a complete collection", async () => {
  const ai = vi.spyOn(bindings.AI, "run").mockRejectedValue(new Error("must not call AI"));
  try {
    await collectPublicAnnouncements(bindings.DB, { now, ai: bindings, fetcher: source(["1"]) });
    expect((await getPublicAnnouncements(bindings.DB, now)).events).toHaveLength(1);
    const later = new Date("2026-09-24T00:00:00Z");
    await collectPublicAnnouncements(bindings.DB, {
      now: later,
      ai: bindings,
      fetcher: source([])
    });
    expect(await getPublicAnnouncements(bindings.DB, later)).toMatchObject({
      status: "ready",
      events: [],
      lastSuccessAt: later.toISOString()
    });
    expect(ai).not.toHaveBeenCalled();
  } finally {
    ai.mockRestore();
  }
});

it("does not mark a valid half-day snapshot stale until its grace period expires", async () => {
  await collectPublicAnnouncements(bindings.DB, { now, fetcher: source([]) });
  expect((await getPublicAnnouncements(bindings.DB, new Date("2026-09-22T13:00:00Z"))).status).toBe(
    "ready"
  );
  expect(
    (await getPublicAnnouncements(bindings.DB, new Date("2026-09-22T13:00:00.001Z"))).status
  ).toBe("stale");
});
