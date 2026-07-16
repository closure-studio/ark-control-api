import type { Env } from "./env";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runRetentionCleanup(env: Env, now = new Date()): Promise<void> {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM watcher_ai_reviews WHERE created_at < ?").bind(before(90)),
    env.DB.prepare("DELETE FROM gcp_instance_operations WHERE created_at < ?").bind(before(365))
  ]);
}
