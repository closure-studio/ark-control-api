import { describe, expect, it, vi } from "vitest";

import { scheduledTaskForCron } from "../src/index";
import { buildMaintenanceMessage } from "../src/services/maintenance/notification";
import { parseMaintenanceAiJson } from "../src/services/maintenance/ai";
import { runMaintenanceMonitorWithDependencies } from "../src/services/maintenance/monitor";
import { sendQqBotAutoMessage } from "../src/services/notifications/qq-bot";
import {
  extractNewsLinks,
  extractNewsId,
  parseNewsDetail
} from "../src/utils/maintenance/news-html";
import { classifyByRules, extractMaintenanceTime } from "../src/utils/maintenance/rules";

describe("maintenance monitor contracts", () => {
  it("extracts unique numeric links and parses detail fallbacks", () => {
    const html = `
      <a href="/news/9692">maintenance</a>
      <a href="https://ak.hypergryph.com/news/9692?from=list">duplicate</a>
      <a href="https://example.com/news/1234">external</a>
      <script>window.__NEWS__ = [{"url":"https://ak.hypergryph.com/news/3044"}]</script>
    `;

    expect(extractNewsLinks(html)).toEqual([
      { id: "9692", url: "https://ak.hypergryph.com/news/9692" },
      { id: "3044", url: "https://ak.hypergryph.com/news/3044" }
    ]);
    expect(extractNewsId("https://ak.hypergryph.com/news/9692")).toBe("9692");
    expect(extractNewsId("https://ak.hypergryph.com/foo/news/9692")).toBeNull();
    expect(extractNewsId("https://ak.hypergryph.com/news/9692abc")).toBeNull();

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
        reason: expect.stringContaining("AI provider unavailable")
      })
    );
  });
});

describe("scheduled cron routing", () => {
  it("routes only known schedules", () => {
    expect(scheduledTaskForCron("*/10 * * * *")).toBe("watcher");
    expect(scheduledTaskForCron("17 * * * *")).toBe("maintenance");
    expect(scheduledTaskForCron("15 3 * * *")).toBe("retention");
    expect(scheduledTaskForCron("0 0 * * *")).toBeNull();
  });
});
