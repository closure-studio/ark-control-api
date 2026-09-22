import * as v from "valibot";
import { readSnapshot } from "../../repositories/public-announcements";
import { SnapshotSchema, type Snapshot } from "../../schemas/public-announcements/snapshot";

export async function getPublicAnnouncements(db: D1Database, now = new Date()): Promise<Snapshot> {
  try {
    const saved = await readSnapshot(db);
    const events: Snapshot["events"] = [];
    let bytes = 0;
    let truncated = false;
    for (const event of saved?.events ?? []) {
      bytes += new TextEncoder().encode(JSON.stringify(event)).byteLength + 1;
      if (events.length === 100 || bytes > 900_000) {
        truncated = true;
        break;
      }
      events.push(event);
    }
    // A half-day collection gets one hour of grace; a failed attempt never renews this clock.
    const stale = saved && now.getTime() - Date.parse(saved.collectedAt) > 13 * 60 * 60 * 1000;
    const pending = events.some((event) =>
      event.windows.some((window) => window.parseStatus === "pending")
    );
    // Legacy incomplete collections use the epoch only as a stale marker, never as a success time.
    const lastSuccessAt =
      saved?.collectedAt === "1970-01-01T00:00:00.000Z" ? null : (saved?.collectedAt ?? null);
    return v.parse(SnapshotSchema, {
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      lastAttemptAt: null,
      lastSuccessAt,
      status: !saved ? "unavailable" : stale ? "stale" : pending || truncated ? "partial" : "ready",
      errorCode: truncated ? "limit_reached" : pending ? "parse_pending" : null,
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
