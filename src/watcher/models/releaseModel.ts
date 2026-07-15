export interface ReleaseRow {
  id: number;
  apk_filename: string;
  final_url: string;
  detected_at: string;
}

export async function getReleaseByApkFilename(db: D1Database, apkFilename: string): Promise<ReleaseRow | null> {
  return await db
    .prepare("SELECT id, apk_filename, final_url, detected_at FROM watcher_releases WHERE apk_filename = ?")
    .bind(apkFilename)
    .first<ReleaseRow>();
}

export async function getOrCreateRelease(db: D1Database, apkFilename: string, finalUrl: string, now: string): Promise<ReleaseRow> {
  await db
    .prepare("INSERT OR IGNORE INTO watcher_releases (apk_filename, final_url, detected_at) VALUES (?, ?, ?)")
    .bind(apkFilename, finalUrl, now)
    .run();

  const row = await getReleaseByApkFilename(db, apkFilename);
  if (!row) {
    throw new Error("release_get_or_create_failed");
  }
  return row;
}

export async function listReleases(db: D1Database, limit: number, offset: number): Promise<ReleaseRow[]> {
  const result = await db
    .prepare("SELECT id, apk_filename, final_url, detected_at FROM watcher_releases ORDER BY detected_at DESC, id DESC LIMIT ? OFFSET ?")
    .bind(limit, offset)
    .all<ReleaseRow>();
  return result.results ?? [];
}

export async function getRelease(db: D1Database, releaseId: number): Promise<ReleaseRow | null> {
  return await db.prepare("SELECT id, apk_filename, final_url, detected_at FROM watcher_releases WHERE id = ?").bind(releaseId).first<ReleaseRow>();
}

export async function getReleaseApkFilename(db: D1Database, releaseId: number): Promise<string> {
  const row = await db.prepare("SELECT apk_filename FROM watcher_releases WHERE id = ?").bind(releaseId).first<{ apk_filename: string }>();
  if (!row) {
    throw new Error("release_not_found");
  }
  return row.apk_filename;
}

export async function getLatestReleaseApkFilename(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare("SELECT apk_filename FROM watcher_releases ORDER BY detected_at DESC, id DESC LIMIT 1")
    .first<{ apk_filename: string }>();
  return row?.apk_filename ?? null;
}
