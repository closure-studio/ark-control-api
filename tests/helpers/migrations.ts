import { readdirSync, readFileSync } from "node:fs";

const migrationsDirectory = new URL("../../migrations/", import.meta.url);
const statementBreakpoint = "--> statement-breakpoint";

export const migrationFiles = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

function migrationStatements(files: readonly string[]): string[] {
  return files.flatMap((name) =>
    readFileSync(new URL(name, migrationsDirectory), "utf8")
      .split(statementBreakpoint)
      .map((statement) => statement.trim())
      .filter(Boolean)
  );
}

export function applySqliteMigrations(
  db: { exec(sql: string): unknown },
  files: readonly string[] = migrationFiles
): void {
  for (const statement of migrationStatements(files)) db.exec(statement);
}

export async function applyD1Migrations(
  db: D1Database,
  files: readonly string[] = migrationFiles
): Promise<void> {
  for (const statement of migrationStatements(files)) await db.prepare(statement).run();
}
