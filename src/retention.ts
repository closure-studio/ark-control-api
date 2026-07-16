import { lt } from "drizzle-orm";

import { createDatabase } from "./db/client";
import { gcpInstanceOperations } from "./db/schema";
import type { Env } from "./env";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runRetentionCleanup(env: Env, now = new Date()): Promise<void> {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  await createDatabase(env.DB)
    .delete(gcpInstanceOperations)
    .where(lt(gcpInstanceOperations.created_at, before(365)))
    .run();
}
