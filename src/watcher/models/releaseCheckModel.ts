export async function insertReleaseCheck(
  db: D1Database,
  input: {
    checkedAt: string;
    finalUrl: string | null;
    apkFilename: string | null;
    outcome: "unchanged" | "release_created" | "failed";
    releaseId?: number | null;
    errorMessage: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO watcher_release_checks (outcome, final_url, apk_filename, release_id, error_message, checked_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(input.outcome, input.finalUrl, input.apkFilename, input.releaseId ?? null, input.errorMessage, input.checkedAt)
    .run();
}

export interface WatcherCheckStatusRow {
  outcome: "unchanged" | "release_created" | "failed";
  error_message: string | null;
  checked_at: string;
}

export async function getLatestReleaseCheck(db: D1Database): Promise<WatcherCheckStatusRow | null> {
  return await db
    .prepare("SELECT outcome, error_message, checked_at FROM watcher_release_checks ORDER BY checked_at DESC, id DESC LIMIT 1")
    .first<WatcherCheckStatusRow>();
}

export async function getLastSuccessfulCheckAt(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare("SELECT checked_at FROM watcher_release_checks WHERE outcome != 'failed' ORDER BY checked_at DESC, id DESC LIMIT 1")
    .first<{ checked_at: string }>();
  return row?.checked_at ?? null;
}
