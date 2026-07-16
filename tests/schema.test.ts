import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8");
const unifiedVpsMigration = readFileSync(
  new URL("../migrations/0002_unified_vps.sql", import.meta.url),
  "utf8"
);
const simplifiedMigration = readFileSync(
  new URL("../migrations/0003_simplify_vps_and_watcher.sql", import.meta.url),
  "utf8"
);
const leanMigration = readFileSync(
  new URL("../migrations/0004_lean_schema.sql", import.meta.url),
  "utf8"
);

describe("control database baseline", () => {
  it("keeps the historical eight-table baseline", () => {
    const tables = [...migration.matchAll(/CREATE TABLE\s+([a-z_]+)/g)].map((match) => match[1]);
    expect(tables).toEqual([
      "gcp_accounts",
      "gcp_instance_operations",
      "vps_hosts",
      "control_job_locks",
      "watcher_releases",
      "watcher_release_checks",
      "watcher_deployments",
      "watcher_ai_reviews"
    ]);
  });

  it("preserves audit history when accounts and hosts are deleted", () => {
    expect(migration).toContain("REFERENCES gcp_accounts(id) ON DELETE SET NULL");
    expect(migration).toContain("REFERENCES vps_hosts(id) ON DELETE SET NULL");
    expect(migration).not.toContain("gcp_vm_operations");
    expect(migration).not.toContain("app_state");
  });

  it("enforces business keys and scheduler indexes", () => {
    expect(migration).toContain("project_id TEXT NOT NULL UNIQUE");
    expect(migration).toContain("UNIQUE (address, port, username)");
    expect(migration).toContain("idx_watcher_deployments_status_next_check");
    expect(migration).toContain("UNIQUE (release_id, host_id)");
  });

  it("keeps operation-to-host history in the unified migration", () => {
    expect(unifiedVpsMigration).toContain("host_id INTEGER REFERENCES vps_hosts(id) ON DELETE SET NULL");
  });

  it("reduces the final schema to seven tables and a focused VPS record", () => {
    expect(simplifiedMigration).toContain("DROP TABLE watcher_release_checks");
    expect(simplifiedMigration).toContain("DROP INDEX IF EXISTS idx_vps_hosts_gcp_account");
    expect(simplifiedMigration).toContain("DROP INDEX IF EXISTS idx_vps_hosts_gcp_identity");
    for (const column of [
      "verify_command",
      "password_updated_at",
      "gcp_account_id",
      "gcp_project_id",
      "gcp_zone",
      "gcp_instance_name"
    ]) {
      expect(simplifiedMigration).toContain(`ALTER TABLE vps_hosts DROP COLUMN ${column}`);
    }
  });

  it("removes write-only history and unused columns in the lean migration", () => {
    expect(leanMigration).toContain("DROP TABLE watcher_ai_reviews");
    expect(leanMigration).not.toContain("idx_gcp_instance_operations_batch");
  });

  it("preserves data and foreign keys while reducing the final schema to six tables", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("PRAGMA foreign_keys = ON");
      db.exec(migration);
      db.exec(unifiedVpsMigration);
      db.exec(simplifiedMigration);
      db.exec(`
        INSERT INTO gcp_accounts (
          id, name, project_id, project_number, service_account_email,
          workload_identity_provider, default_zone
        ) VALUES (
          1, 'Account', 'project-id', '123456', 'service@example.com',
          'provider', 'us-central1-a'
        );
        INSERT INTO vps_hosts (
          id, name, address, port, username, password_ciphertext
        ) VALUES (1, 'Host', '192.0.2.1', 22, 'root', 'ciphertext');
        INSERT INTO watcher_releases (
          id, apk_filename, final_url, detected_at
        ) VALUES (1, 'release.apk', 'https://example.com/release.apk', '2026-01-01T00:00:00.000Z');
        INSERT INTO watcher_deployments (
          id, release_id, host_id, host_name_snapshot, host_address_snapshot,
          host_port_snapshot, host_username_snapshot, status, attempt_count,
          created_at, updated_at
        ) VALUES (
          1, 1, 1, 'Host', '192.0.2.1', 22, 'root', 'running', 3,
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        );
        INSERT INTO watcher_ai_reviews (
          deployment_id, model, prompt_version, status, response_valid,
          reason, raw_response, created_at
        ) VALUES (
          1, 'model', 'v1', 'running', 1, 'still running', '{}',
          '2026-01-01T00:00:00.000Z'
        );
        INSERT INTO gcp_instance_operations (
          id, batch_id, account_id, account_name_snapshot, project_id, zone,
          instance_name, action, status, created_at, completed_at, host_id
        ) VALUES (
          1, 'batch', 1, 'Account', 'project-id', 'us-central1-a',
          'instance', 'create', 'succeeded', '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z', 1
        );
      `);

      db.exec(leanMigration);

      const tables = db
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all()
        .map((row) => String(row.name));
      expect(tables).toEqual([
        "control_job_locks",
        "gcp_accounts",
        "gcp_instance_operations",
        "vps_hosts",
        "watcher_deployments",
        "watcher_releases"
      ]);

      const columns = (table: string) =>
        db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name));
      expect(columns("gcp_accounts")).not.toContain("project_number");
      for (const column of ["completed_at", "host_id"]) {
        expect(columns("gcp_instance_operations")).not.toContain(column);
      }
      for (const column of ["host_port_snapshot", "host_username_snapshot", "attempt_count"]) {
        expect(columns("watcher_deployments")).not.toContain(column);
      }
      expect(tables.reduce((total, table) => total + columns(table).length, 0)).toBe(56);

      const indexes = db
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'index'")
        .all()
        .map((row) => String(row.name));
      expect(indexes).not.toContain("idx_gcp_instance_operations_batch");
      expect(indexes).not.toContain("idx_gcp_instance_operations_host_created");

      expect(db.prepare("SELECT name FROM gcp_accounts WHERE id = 1").get()).toMatchObject({
        name: "Account"
      });
      expect(
        db.prepare("SELECT batch_id FROM gcp_instance_operations WHERE id = 1").get()
      ).toMatchObject({ batch_id: "batch" });
      expect(
        db.prepare("SELECT status FROM watcher_deployments WHERE id = 1").get()
      ).toMatchObject({ status: "running" });
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

      db.exec("DELETE FROM gcp_accounts WHERE id = 1; DELETE FROM vps_hosts WHERE id = 1;");
      expect(
        db.prepare("SELECT account_id FROM gcp_instance_operations WHERE id = 1").get()
      ).toMatchObject({ account_id: null });
      expect(
        db.prepare("SELECT host_id FROM watcher_deployments WHERE id = 1").get()
      ).toMatchObject({ host_id: null });
    } finally {
      db.close();
    }
  });
});
