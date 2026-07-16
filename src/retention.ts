import type { Env } from "./env";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runRetentionCleanup(env: Env, now = new Date()): Promise<void> {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  await env.DB.prepare("DELETE FROM gcp_instance_operations WHERE created_at < ?")
    .bind(before(365))
    .run();
}
