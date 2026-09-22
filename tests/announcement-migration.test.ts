import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { applySqliteMigrations, migrationFiles } from "./helpers/migrations";

it.each(["ready", "failed"])(
  "migrates %s legacy collections without losing public events",
  (status) => {
    const db = new DatabaseSync(":memory:");
    try {
      applySqliteMigrations(db, migrationFiles.slice(0, 2));
      db.prepare("INSERT INTO public_announcement_collection VALUES (?, ?, ?, ?, ?, ?)").run(
        "official-cn",
        "2026-09-22T12:00:00Z",
        "2026-09-22T00:00:00Z",
        status,
        status === "failed" ? "source_failed" : null,
        null
      );
      const windows = [
        {
          kind: "activity",
          sectionLabel: "活动",
          startAt: null,
          endAt: null,
          timezone: "Asia/Shanghai",
          rawTimeText: "时间待定",
          parseStatus: "pending"
        }
      ];
      db.prepare("INSERT INTO public_announcements VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        "001",
        "https://ak.hypergryph.com/news/001",
        "活动公告",
        null,
        "hash",
        JSON.stringify(windows),
        "2026-09-22T00:00:00Z",
        "2026-09-22T00:00:00Z"
      );
      applySqliteMigrations(db, migrationFiles.slice(2));
      const row = db.prepare("SELECT * FROM public_announcement_snapshot").get();
      expect(row?.collected_at).toBe(
        status === "ready" ? "2026-09-22T00:00:00Z" : "1970-01-01T00:00:00.000Z"
      );
      expect(JSON.parse(String(row?.events_json))).toEqual([
        {
          newsId: "001",
          sourceUrl: "https://ak.hypergryph.com/news/001",
          title: "活动公告",
          publishedAt: null,
          fetchedAt: "2026-09-22T00:00:00Z",
          windows
        }
      ]);
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE name IN ('public_announcements', 'public_announcement_collection')"
          )
          .all()
      ).toEqual([]);
    } finally {
      db.close();
    }
  }
);
it.each([false, true])(
  "preserves the distinction between never collected and successful empty (%s)",
  (collected) => {
    const db = new DatabaseSync(":memory:");
    try {
      applySqliteMigrations(db, migrationFiles.slice(0, 2));
      if (collected)
        db.prepare("INSERT INTO public_announcement_collection VALUES (?, ?, ?, ?, ?, ?)").run(
          "official-cn",
          "2026-09-22T00:00:00Z",
          "2026-09-22T00:00:00Z",
          "ready",
          null,
          null
        );
      applySqliteMigrations(db, migrationFiles.slice(2));
      const rows = db.prepare("SELECT events_json FROM public_announcement_snapshot").all();
      expect(rows).toEqual(collected ? [{ events_json: "[]" }] : []);
    } finally {
      db.close();
    }
  }
);
