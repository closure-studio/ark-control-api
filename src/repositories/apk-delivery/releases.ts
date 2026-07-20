import { desc, eq } from "drizzle-orm";

import { createDatabase } from "../../db/client";
import { arknightsApkReleases, type ArknightsApkReleaseRow } from "../../db/schema";

export async function getReleaseByApkFilename(
  db: D1Database,
  apkFilename: string
): Promise<ArknightsApkReleaseRow | null> {
  return (
    (await createDatabase(db)
      .select()
      .from(arknightsApkReleases)
      .where(eq(arknightsApkReleases.apk_filename, apkFilename))
      .get()) ?? null
  );
}

export async function getOrCreateRelease(
  db: D1Database,
  apkFilename: string,
  finalUrl: string,
  now: string
): Promise<ArknightsApkReleaseRow> {
  await createDatabase(db)
    .insert(arknightsApkReleases)
    .values({ apk_filename: apkFilename, final_url: finalUrl, detected_at: now })
    .onConflictDoNothing({ target: arknightsApkReleases.apk_filename })
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
): Promise<ArknightsApkReleaseRow[]> {
  return createDatabase(db)
    .select()
    .from(arknightsApkReleases)
    .orderBy(desc(arknightsApkReleases.detected_at), desc(arknightsApkReleases.id))
    .limit(limit)
    .offset(offset)
    .all();
}

export async function getRelease(
  db: D1Database,
  releaseId: number
): Promise<ArknightsApkReleaseRow | null> {
  return (
    (await createDatabase(db)
      .select()
      .from(arknightsApkReleases)
      .where(eq(arknightsApkReleases.id, releaseId))
      .get()) ?? null
  );
}

export async function getReleaseApkFilename(
  db: D1Database,
  releaseId: number
): Promise<string> {
  const row = await createDatabase(db)
    .select({ apk_filename: arknightsApkReleases.apk_filename })
    .from(arknightsApkReleases)
    .where(eq(arknightsApkReleases.id, releaseId))
    .get();
  if (!row) {
    throw new Error("release_not_found");
  }
  return row.apk_filename;
}

export async function getLatestReleaseApkFilename(db: D1Database): Promise<string | null> {
  const row = await createDatabase(db)
    .select({ apk_filename: arknightsApkReleases.apk_filename })
    .from(arknightsApkReleases)
    .orderBy(desc(arknightsApkReleases.detected_at), desc(arknightsApkReleases.id))
    .limit(1)
    .get();
  return row?.apk_filename ?? null;
}
