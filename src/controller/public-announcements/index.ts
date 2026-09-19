import * as v from "valibot";
import {
  listAnnouncements,
  projectAnnouncement,
  readCollection
} from "../../repositories/public-announcements";
import { SnapshotSchema, type Snapshot } from "../../schemas/public-announcements/snapshot";

export async function getPublicAnnouncements(db: D1Database, now = new Date()): Promise<Snapshot> {
  try {
    const state = await readCollection(db);
    const rows = await listAnnouncements(db, now);
    const events: Snapshot["events"] = [];
    let bytes = 0;
    let truncated = rows.length > 100;
    for (const row of rows.slice(0, 100)) {
      const event = projectAnnouncement(row);
      if (!event.windows.length) continue;
      const size = new TextEncoder().encode(JSON.stringify(event)).byteLength;
      if (bytes + size > 900_000) {
        truncated = true;
        break;
      }
      bytes += size + 1;
      events.push(event);
    }
    const reference = state?.last_success_at ?? state?.last_attempt_at;
    const old = !reference || now.getTime() - Date.parse(reference) > 7_200_000;
    const status = !state
      ? "unavailable"
      : state.status === "failed"
        ? events.length
          ? "stale"
          : "unavailable"
        : old
          ? "stale"
          : truncated
            ? "partial"
            : state.status;
    return v.parse(SnapshotSchema, {
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      lastAttemptAt: state?.last_attempt_at ?? null,
      lastSuccessAt: state?.last_success_at ?? null,
      status,
      errorCode: truncated ? "limit_reached" : (state?.error_code ?? null),
      events
    });
  } catch {
    return {
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      lastAttemptAt: null,
      lastSuccessAt: null,
      status: "unavailable",
      errorCode: "storage_failed",
      events: []
    };
  }
}
