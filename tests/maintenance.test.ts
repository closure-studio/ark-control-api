import { describe, expect, it, vi } from "vitest";
import * as v from "valibot";

import { scheduledTaskForCron } from "../src/index";
import { MaintenanceNewsListResponseSchema } from "../src/schemas/maintenance/announcements";
import { fetchMaintenanceNewsLinks } from "../src/services/maintenance/news";
import { buildMaintenanceMessage } from "../src/services/maintenance/notification";
import { parseMaintenanceAiJson } from "../src/services/maintenance/ai";
import { runMaintenanceMonitorWithDependencies } from "../src/services/maintenance/monitor";
import { sendQqBotAutoMessage } from "../src/services/notifications/qq-bot";
import { parseNewsDetail } from "../src/utils/maintenance/news-html";
import { classifyByRules, extractMaintenanceTime } from "../src/utils/maintenance/rules";

describe("maintenance monitor contracts", () => {
  it("fetches, validates, deduplicates, and limits paginated news API results", async () => {
    const pageIds = new Map([
      ["1", ["1459", "8571", "6247", "4926", "9683", "9684"]],
      ["2", ["9684", "0795", "5107", "0796", "4929", "8573"]]
    ]);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const page = url.searchParams.get("page") ?? "";
      const ids = pageIds.get(page) ?? [];
      expect(url.searchParams.get("category")).toBe("LATEST");
      expect(init?.headers).toMatchObject({ Accept: "application/json" });
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            list: ids.map((cid) => ({ cid, ignored: "upstream field" })),
            end: page === "2"
          }
        })
      );
    });

    await expect(fetchMaintenanceNewsLinks({ fetcher })).resolves.toEqual([
      { id: "1459", url: "https://ak.hypergryph.com/news/1459" },
      { id: "8571", url: "https://ak.hypergryph.com/news/8571" },
      { id: "6247", url: "https://ak.hypergryph.com/news/6247" },
      { id: "4926", url: "https://ak.hypergryph.com/news/4926" },
      { id: "9683", url: "https://ak.hypergryph.com/news/9683" },
      { id: "9684", url: "https://ak.hypergryph.com/news/9684" },
      { id: "0795", url: "https://ak.hypergryph.com/news/0795" },
      { id: "5107", url: "https://ak.hypergryph.com/news/5107" },
      { id: "0796", url: "https://ak.hypergryph.com/news/0796" },
      { id: "4929", url: "https://ak.hypergryph.com/news/4929" }
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid news API contracts and empty results", async () => {
    expect(
      v.safeParse(MaintenanceNewsListResponseSchema, {
        code: 0,
        data: { list: [{ cid: "0795" }], end: true }
      }).success
    ).toBe(true);
    expect(
      v.safeParse(MaintenanceNewsListResponseSchema, {
        code: 1,
        data: { list: [{ cid: "not-numeric" }], end: "yes" }
      }).success
    ).toBe(false);

    const invalidJsonFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not json"));
    await expect(fetchMaintenanceNewsLinks({ fetcher: invalidJsonFetcher })).rejects.toThrow(
      "page 1 returned an invalid response"
    );

    const emptyFetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, data: { list: [], end: true } }))
    );
    await expect(fetchMaintenanceNewsLinks({ fetcher: emptyFetcher })).rejects.toThrow(
      "returned no announcements"
    );
  });

  it("rejects failed news API requests and pagination without progress", async () => {
    const failedFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 502 }));
    await expect(fetchMaintenanceNewsLinks({ fetcher: failedFetcher })).rejects.toThrow(
      "request failed with status 502"
    );

    const stalledFetcher = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ code: 0, data: { list: [{ cid: "9692" }], end: false } })
        )
    );
    await expect(fetchMaintenanceNewsLinks({ fetcher: stalledFetcher })).rejects.toThrow(
      "page 2 did not contain any new announcements"
    );
  });

  it("parses detail fallbacks", () => {
    const detail = parseNewsDetail(
      "9692",
      "https://ak.hypergryph.com/news/9692",
      `
        <html>
          <head><title>旧标题 - 明日方舟</title></head>
          <body>
            <main>
              <h1>[明日方舟]版本更新停机维护公告</h1>
              <div class="content">维护时间：2026年05月01日06:00 ~ 12:00 维护期间无法登录游戏。</div>
              <script>不要进入正文</script>
            </main>
          </body>
        </html>
      `
    );

    expect(detail.title).toBe("[明日方舟]版本更新停机维护公告");
    expect(detail.content).toContain("维护期间无法登录游戏");
    expect(detail.content).not.toContain("不要进入正文");

    const rscDetail = parseNewsDetail(
      "9692",
      "https://ak.hypergryph.com/news/9692",
      String.raw`<title>版本更新停机维护公告 - 明日方舟</title><script>self.__next_f.push([1,"\u003cp\u003e维护时间：2026年05月01日06:00 ~ 12:00\u003c/p\u003e\u003cp\u003e维护期间无法登录游戏。\u003c/p\u003e"])</script>`
    );
    expect(rscDetail.title).toBe("版本更新停机维护公告");
    expect(rscDetail.content).toContain("维护期间无法登录游戏");
  });

  it("classifies maintenance announcements and extracts time ranges", () => {
    const result = classifyByRules({
      title: "[明日方舟]版本更新停机维护公告",
      content: "维护时间：2026年05月01日06:00 ~ 12:00 维护期间无法登录游戏。"
    });

    expect(result).toMatchObject({
      status: "maintenance",
      isMaintenance: true,
      maintenanceStart: "2026年05月01日06:00",
      maintenanceEnd: "12:00"
    });
    expect(extractMaintenanceTime("维护时间：3月10日 06:00 - 12:00")).toEqual({
      start: "3月10日06:00",
      end: "12:00",
      raw: "3月10日 06:00 - 12:00"
    });
  });

  it("parses structured AI output and embedded JSON", () => {
    const content = JSON.stringify({
      is_maintenance: true,
      confidence: 0.98,
      maintenance_start: "2026年05月01日06:00",
      maintenance_end: "12:00",
      reason: "公告说明停机维护",
      summary: "服务器将在指定时间停机维护。"
    });

    expect(parseMaintenanceAiJson(`前置说明\n${content}`)).toMatchObject({
      is_maintenance: true,
      confidence: 0.98
    });
    expect(() => parseMaintenanceAiJson('{"is_maintenance":true}')).toThrow(
      "AI response was not valid maintenance JSON"
    );
  });

  it("builds the source-compatible QQ notification", () => {
    const message = buildMaintenanceMessage(
      {
        id: "9692",
        url: "https://ak.hypergryph.com/news/9692",
        title: "版本更新停机维护公告",
        content: "维护时间：2026年05月01日06:00 ~ 12:00"
      },
      {
        status: "maintenance",
        isMaintenance: true,
        reason: "标题包含停机维护关键词",
        summary: "服务器将在指定时间停机维护。",
        maintenanceStart: "2026年05月01日06:00",
        maintenanceEnd: "12:00"
      }
    );

    expect(message).toContain("【明日方舟停机维护提醒】");
    expect(message).toContain("2026年05月01日06:00 ~ 12:00");
    expect(message).toContain("https://ak.hypergryph.com/news/9692");
  });

  it("sends QQBot messages with an abortable request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    await sendQqBotAutoMessage({
      token: "secret-token",
      uid: 913468406,
      msg: "maintenance",
      fetcher,
      timeoutMs: 1_000
    });

    expect(fetcher).toHaveBeenCalledWith(
      "http://qqbot.arknights.app/api/send_msg_auto",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal)
      })
    );
    const request = fetcher.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      token: "secret-token",
      uid: 913468406,
      msg: "maintenance"
    });
  });

  it("claims, processes, and finalizes one announcement", async () => {
    const link = { id: "9692", url: "https://ak.hypergryph.com/news/9692" };
    const classification = classifyByRules({
      title: "版本更新停机维护公告",
      content: "维护时间：2026年05月01日06:00 ~ 12:00"
    });
    const complete = vi.fn(async () => undefined);
    const fail = vi.fn(async () => undefined);

    await runMaintenanceMonitorWithDependencies({
      now: () => new Date("2026-07-18T15:00:00.000Z"),
      fetchLinks: async () => [link],
      fetchDetail: async () => ({ ...link, title: "版本更新停机维护公告", content: "维护时间" }),
      classifyRules: () => classification,
      classifyAi: async () => classification,
      notify: async () => ({ notified: true, notifyChannel: "qqbot", notifyError: null }),
      claim: async () => true,
      complete,
      fail,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined }
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith("9692", expect.objectContaining({ processingState: "completed" }));
    expect(fail).not.toHaveBeenCalled();
  });

  it("records a terminal failure without stopping the monitor", async () => {
    const fail = vi.fn(async () => undefined);
    await runMaintenanceMonitorWithDependencies({
      now: () => new Date("2026-07-18T15:00:00.000Z"),
      fetchLinks: async () => [
        { id: "9692", url: "https://ak.hypergryph.com/news/9692" },
        { id: "9693", url: "https://ak.hypergryph.com/news/9693" }
      ],
      fetchDetail: async (link) => {
        if (link.id === "9692") throw new Error("detail unavailable");
        return { ...link, title: "普通公告", content: "活动公告" };
      },
      classifyRules: classifyByRules,
      classifyAi: async () => classifyByRules({ title: "普通公告", content: "活动公告" }),
      notify: async () => ({ notified: false, notifyChannel: null, notifyError: null }),
      claim: async () => true,
      complete: async () => undefined,
      fail,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined }
    });

    expect(fail).toHaveBeenCalledOnce();
    expect(fail).toHaveBeenCalledWith("9692", expect.objectContaining({ processingState: "failed" }));
  });

  it("records AI provider failures as failed announcements", async () => {
    const fail = vi.fn(async () => undefined);
    const complete = vi.fn(async () => undefined);
    await runMaintenanceMonitorWithDependencies({
      now: () => new Date("2026-07-18T15:00:00.000Z"),
      fetchLinks: async () => [
        { id: "9694", url: "https://ak.hypergryph.com/news/9694" }
      ],
      fetchDetail: async (link) => ({
        ...link,
        title: "无法确定的公告",
        content: "公告正文"
      }),
      classifyRules: () => classifyByRules({ title: "无法确定的公告", content: "公告正文" }),
      classifyAi: async () => {
        throw new Error("AI provider unavailable");
      },
      notify: async () => ({ notified: false, notifyChannel: null, notifyError: null }),
      claim: async () => true,
      complete,
      fail,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined }
    });

    expect(complete).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith(
      "9694",
      expect.objectContaining({
        processingState: "failed",
        errorMessage: expect.stringContaining("AI provider unavailable")
      })
    );
  });
});

describe("scheduled cron routing", () => {
  it("routes only known schedules", () => {
    expect(scheduledTaskForCron("*/10 * * * *")).toBe("apk-delivery");
    expect(scheduledTaskForCron("17 * * * *")).toBe("maintenance");
    expect(scheduledTaskForCron("15 3 * * *")).toBe("retention");
    expect(scheduledTaskForCron("0 0 * * *")).toBeNull();
  });
});
