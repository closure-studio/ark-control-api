import { asc, eq, sql } from "drizzle-orm";
import * as v from "valibot";
import { createDatabase } from "../../db/client";
import { publicAnnouncements, publicAnnouncementCollection } from "../../db/schema";
import { AnnouncementSchema, WindowsSchema } from "../../schemas/public-announcements/snapshot";

export async function readCollection(db: D1Database) {
  return createDatabase(db)
    .select()
    .from(publicAnnouncementCollection)
    .where(eq(publicAnnouncementCollection.source_id, "official-cn"))
    .get();
}
export async function saveCollection(
  db: D1Database,
  row: typeof publicAnnouncementCollection.$inferInsert
) {
  await createDatabase(db)
    .insert(publicAnnouncementCollection)
    .values(row)
    .onConflictDoUpdate({ target: publicAnnouncementCollection.source_id, set: row })
    .run();
}
export async function listAnnouncements(db: D1Database, now = new Date()) {
  // Active/uncertain records must not be starved by an ever-growing expired archive.
  const active = sql`EXISTS (SELECT 1 FROM json_each(${publicAnnouncements.windows_json}) AS window WHERE json_extract(window.value, '$.endAt') IS NULL OR julianday(json_extract(window.value, '$.endAt')) > julianday(${now.toISOString()}))`;
  return createDatabase(db)
    .select()
    .from(publicAnnouncements)
    .orderBy(sql`${active} DESC`, asc(publicAnnouncements.recheck_at))
    .limit(101)
    .all();
}
export async function saveAnnouncement(
  db: D1Database,
  row: typeof publicAnnouncements.$inferInsert
) {
  await createDatabase(db)
    .insert(publicAnnouncements)
    .values(row)
    .onConflictDoUpdate({ target: publicAnnouncements.news_id, set: row })
    .run();
}
export function projectAnnouncement(row: typeof publicAnnouncements.$inferSelect) {
  return v.parse(AnnouncementSchema, {
    newsId: row.news_id,
    sourceUrl: row.source_url,
    title: row.title,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    windows: v.parse(v.pipe(v.string(), v.parseJson(), WindowsSchema), row.windows_json)
  });
}
