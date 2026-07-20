import { and, eq, lte } from "drizzle-orm";

import { createDatabase } from "../db/client";
import { controlJobLocks } from "../db/schema";

export async function acquireControlJobLock(
  db: D1Database,
  key: string,
  owner: string,
  expiresAt: string,
  now: string
): Promise<boolean> {
  const result = await createDatabase(db)
    .insert(controlJobLocks)
    .values({ job_name: key, owner, acquired_at: now, expires_at: expiresAt })
    .onConflictDoUpdate({
      target: controlJobLocks.job_name,
      set: {
        owner,
        acquired_at: now,
        expires_at: expiresAt
      },
      setWhere: lte(controlJobLocks.expires_at, now)
    })
    .returning({ owner: controlJobLocks.owner })
    .get();

  return result?.owner === owner;
}

export async function releaseControlJobLock(
  db: D1Database,
  key: string,
  owner: string
): Promise<void> {
  await createDatabase(db)
    .delete(controlJobLocks)
    .where(and(eq(controlJobLocks.job_name, key), eq(controlJobLocks.owner, owner)))
    .run();
}
