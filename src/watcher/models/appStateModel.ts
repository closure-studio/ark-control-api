export async function acquireAppStateLock(
  db: D1Database,
  key: string,
  owner: string,
  expiresAt: string,
  now: string,
): Promise<boolean> {
  const result = await db
    .prepare(`INSERT INTO control_job_locks (job_name, owner, acquired_at, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(job_name) DO UPDATE SET
        owner = excluded.owner,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
      WHERE control_job_locks.expires_at <= excluded.acquired_at
      RETURNING owner`)
    .bind(key, owner, now, expiresAt)
    .first<{ owner: string }>();

  return result?.owner === owner;
}

export async function releaseAppStateLock(db: D1Database, key: string, owner: string): Promise<void> {
  await db.prepare("DELETE FROM control_job_locks WHERE job_name = ? AND owner = ?").bind(key, owner).run();
}
