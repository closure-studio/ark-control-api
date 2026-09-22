import { eq } from "drizzle-orm";
import * as v from "valibot";
import { createDatabase } from "../../db/client";
import { publicAnnouncementSnapshot } from "../../db/schema";
import {
  AnnouncementSchema,
  EventsSchema,
  type Announcement
} from "../../schemas/public-announcements/snapshot";

export async function readSnapshot(db: D1Database) {
  const row = await createDatabase(db)
    .select()
    .from(publicAnnouncementSnapshot)
    .where(eq(publicAnnouncementSnapshot.source_id, "official-cn"))
    .get();
  return row
    ? {
        collectedAt: row.collected_at,
        events: v.parse(
          v.pipe(v.string(), v.parseJson(), v.array(AnnouncementSchema)),
          row.events_json
        )
      }
    : null;
}

export async function saveSnapshot(db: D1Database, events: Announcement[], now: Date) {
  const row: typeof publicAnnouncementSnapshot.$inferInsert = {
    source_id: "official-cn",
    source_url: "https://ak.hypergryph.com/news",
    collected_at: now.toISOString(),
    events_json: JSON.stringify(v.parse(EventsSchema, events))
  };
  await createDatabase(db)
    .insert(publicAnnouncementSnapshot)
    .values(row)
    .onConflictDoUpdate({ target: publicAnnouncementSnapshot.source_id, set: row })
    .run();
}
