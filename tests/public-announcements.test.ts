import { describe, expect, it } from "vitest";
import { parseAnnouncement } from "../src/utils/public-announcements/parser";

const parse = (title: string, body: string, publishedAt: string | null = "2026-09-15") =>
  parseAnnouncement(title, body.split("\n"), publishedAt);

describe("public announcement windows", () => {
  it("recognizes disconnect before costume wording and preserves exact minutes", () => {
    expect(parse("闪断更新公告", "更新时装\n2026年09月11日16:00 ~ 16:10")[0]).toMatchObject({
      kind: "brief_disconnect",
      startAt: "2026-09-11T16:00:00+08:00",
      endAt: "2026-09-11T16:10:00+08:00",
      parseStatus: "parsed"
    });
  });
  it("keeps stage, shop and rewards separate from the activity window", () => {
    const windows = parse(
      "活动公告",
      "活动时间：09月04日12:00至09月25日03:59\n关卡开放：09月04日12:00至09月18日03:59\n商店兑换：09月04日12:00至09月25日03:59\n奖励领取：09月04日12:00至09月26日03:59"
    );
    expect(windows.map((w) => [w.kind, w.endAt])).toEqual([
      ["activity", "2026-09-25T03:59:00+08:00"],
      ["stage", "2026-09-18T03:59:00+08:00"],
      ["shop", "2026-09-25T03:59:00+08:00"],
      ["reward", "2026-09-26T03:59:00+08:00"]
    ]);
  });
  it("binds a time-only paragraph to its section", () => {
    expect(parse("活动公告", "商店兑换\n09月04日12:00至09月25日03:59")[0]?.kind).toBe("shop");
  });
  it.each([
    ["02月30日12:00至13:00", "2026-02-01"],
    ["09月20日12:00至13:00", null],
    ["12月31日12:00至01月01日03:59", "2026-12-01"],
    ["2026年09月20日25:00至26:00", "2026-09-15"],
    ["开放时间另行通知", "2026-09-15"]
  ])("does not invent dates for %s", (body, published) => {
    expect(parse("停机维护", body ?? "", published)[0]).toMatchObject({
      parseStatus: "pending",
      endAt: null
    });
  });
  it("accepts explicit cross-year and cross-day dates", () => {
    expect(parse("停机维护", "2026年12月31日23:00至2027年01月01日03:59")[0]?.endAt).toBe(
      "2027-01-01T03:59:00+08:00"
    );
    expect(parse("停机维护", "2026年09月20日23:00至09月21日03:59")[0]?.endAt).toBe(
      "2026-09-21T03:59:00+08:00"
    );
  });
  it("keeps unsupported sections and rejects invalid publication evidence", () => {
    const windows = parse(
      "活动公告",
      "关卡开放：09月04日12:00至09月18日03:59\n商店兑换时间另行通知"
    );
    expect(windows).toHaveLength(2);
    expect(windows[1]).toMatchObject({ kind: "shop", parseStatus: "pending", endAt: null });
    expect(parse("活动公告", "09月04日12:00至09月18日03:59", "2026-02-30")[0]?.startAt).toBeNull();
  });
  it("ignores non-schedule news but preserves ambiguous schedule sections", () => {
    expect(parse("制作组通讯", "感谢各位博士的支持")).toEqual([]);
    expect(parse("活动公告", "开放日期另行通知")[0]?.parseStatus).toBe("pending");
    expect(parse("活动公告", "01月04日12:00至01月18日03:59", "2026-12-28")[0]?.startAt).toBeNull();
  });
  it("withdraws confident dates when a correction cannot be resolved", () => {
    expect(
      parse("活动延期公告", "原定2026年09月20日12:00至13:00，现延期，时间另行通知")[0]
    ).toMatchObject({ parseStatus: "pending", startAt: null, endAt: null });
  });
});
