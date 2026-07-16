import { readdirSync, readFileSync } from "node:fs";

const migrationsDirectory = new URL("../../migrations/", import.meta.url);
const statementBreakpoint = "--> statement-breakpoint";

export const migrationFiles = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const migrationStatements = migrationFiles.flatMap((name) =>
  readFileSync(new URL(name, migrationsDirectory), "utf8")
    .split(statementBreakpoint)
    .map((statement) => statement.trim())
    .filter(Boolean)
);

export function applySqliteMigrations(db: { exec(sql: string): unknown }): void {
  for (const statement of migrationStatements) db.exec(statement);
}

export async function applyD1Migrations(db: D1Database): Promise<void> {
  for (const statement of migrationStatements) await db.prepare(statement).run();
}
