import { and, count, desc, eq, gte, lte } from "drizzle-orm";

import { createDatabase } from "../../db/client";
import { arkhookTaskFailures } from "../../db/schema";
import type { TaskFailureListQuery } from "../../schemas/arkhook/requests";
import { decodeFailureRecord } from "../../utils/arkhook/record-codec";

export async function saveTaskFailure(
  db: D1Database,
  row: typeof arkhookTaskFailures.$inferInsert
) {
  await createDatabase(db)
    .insert(arkhookTaskFailures)
    .values(row)
    .onConflictDoUpdate({ target: arkhookTaskFailures.task_id, set: row })
    .run();
}

function filters(query: TaskFailureListQuery) {
  return and(
    query.stage_id === undefined ? undefined : eq(arkhookTaskFailures.stage_id, query.stage_id),
    query.battle_rank === undefined
      ? undefined
      : eq(arkhookTaskFailures.battle_rank, query.battle_rank),
    query.recorded_from === undefined
      ? undefined
      : gte(arkhookTaskFailures.recorded_at, query.recorded_from),
    query.recorded_to === undefined
      ? undefined
      : lte(arkhookTaskFailures.recorded_at, query.recorded_to)
  );
}

export async function listTaskFailures(db: D1Database, query: TaskFailureListQuery) {
  const database = createDatabase(db);
  const [rows, totals] = await database.batch([
    database
      .select({
        task_id: arkhookTaskFailures.task_id,
        stage_id: arkhookTaskFailures.stage_id,
        battle_rank: arkhookTaskFailures.battle_rank,
        recorded_at: arkhookTaskFailures.recorded_at
      })
      .from(arkhookTaskFailures)
      .where(filters(query))
      .orderBy(desc(arkhookTaskFailures.recorded_at), desc(arkhookTaskFailures.task_id))
      .limit(query.limit)
      .offset(query.offset),
    database.select({ total: count() }).from(arkhookTaskFailures).where(filters(query))
  ]);
  return {
    records: rows,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      count: rows.length,
      total: totals[0]?.total ?? 0
    }
  };
}

export async function getTaskFailure(db: D1Database, taskId: string) {
  const row = await createDatabase(db)
    .select({ record_json: arkhookTaskFailures.record_json })
    .from(arkhookTaskFailures)
    .where(eq(arkhookTaskFailures.task_id, taskId))
    .get();
  return row ? decodeFailureRecord(row.record_json) : null;
}
