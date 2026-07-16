import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export function createDatabase(client: D1Database) {
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDatabase>;
