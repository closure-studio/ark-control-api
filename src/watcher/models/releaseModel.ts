import { desc, eq } from "drizzle-orm";

import { createDatabase } from "../../db/client";
import { watcherReleases, type WatcherReleaseRow } from "../../db/schema";

export type ReleaseRow = WatcherReleaseRow;

export async function getReleaseByApkFilename(
  db: D1Database,
  apkFilename: string
): Promise<ReleaseRow | null> {
  return (
    (await createDatabase(db)
      .select()
      .from(watcherReleases)
      .where(eq(watcherReleases.apk_filename, apkFilename))
      .get()) ?? null
  );
}

export async function getOrCreateRelease(
  db: D1Database,
  apkFilename: string,
  finalUrl: string,
  now: string
): Promise<ReleaseRow> {
  await createDatabase(db)
    .insert(watcherReleases)
    .values({ apk_filename: apkFilename, final_url: finalUrl, detected_at: now })
    .onConflictDoNothing({ target: watcherReleases.apk_filename })
    .run();

  const row = await getReleaseByApkFilename(db, apkFilename);
  if (!row) {
    throw new Error("release_get_or_create_failed");
  }
  return row;
}

export async function listReleases(
  db: D1Database,
  limit: number,
  offset: number
): Promise<ReleaseRow[]> {
  return createDatabase(db)
    .select()
    .from(watcherReleases)
    .orderBy(desc(watcherReleases.detected_at), desc(watcherReleases.id))
    .limit(limit)
    .offset(offset)
    .all();
}

export async function getRelease(
  db: D1Database,
  releaseId: number
): Promise<ReleaseRow | null> {
  return (
    (await createDatabase(db)
      .select()
      .from(watcherReleases)
      .where(eq(watcherReleases.id, releaseId))
      .get()) ?? null
  );
}

export async function getReleaseApkFilename(
  db: D1Database,
  releaseId: number
): Promise<string> {
  const row = await createDatabase(db)
    .select({ apk_filename: watcherReleases.apk_filename })
    .from(watcherReleases)
    .where(eq(watcherReleases.id, releaseId))
    .get();
  if (!row) {
    throw new Error("release_not_found");
  }
  return row.apk_filename;
}

export async function getLatestReleaseApkFilename(db: D1Database): Promise<string | null> {
  const row = await createDatabase(db)
    .select({ apk_filename: watcherReleases.apk_filename })
    .from(watcherReleases)
    .orderBy(desc(watcherReleases.detected_at), desc(watcherReleases.id))
    .limit(1)
    .get();
  return row?.apk_filename ?? null;
}
