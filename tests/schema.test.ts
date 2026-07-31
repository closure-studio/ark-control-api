import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { applySqliteMigrations, migrationFiles } from "./helpers/migrations";

const businessTables = [
  "arknights_apk_host_runs",
  "arknights_apk_releases",
  "arknights_maintenance_announcements",
  "control_job_locks",
  "gcp_accounts",
  "gcp_operation_logs",
  "vps_hosts"
];

describe("control database baseline", () => {
  it("contains the baseline and VPS role migrations", () => {
    expect(migrationFiles).toHaveLength(2);
    expect(migrationFiles[0]).toMatch(/^\d{14}_initial\.sql$/);
    expect(migrationFiles[1]).toMatch(/^\d{14}_add_vps_role\.sql$/);
  });

  it("creates the current tables, columns, and indexes", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("PRAGMA foreign_keys = ON");
      applySqliteMigrations(db);

      const tables = db
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all()
        .map((row) => String(row.name));
      expect(tables).toEqual(businessTables);

      const columns = (table: string) =>
        db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name));
      expect(tables.reduce((total, table) => total + columns(table).length, 0)).toBe(67);
      expect(columns("arknights_maintenance_announcements")).toEqual([
        "news_id",
        "url",
        "processing_state",
        "claim_expires_at",
        "first_seen_at",
        "processed_at",
        "title",
        "is_maintenance",
        "maintenance_start",
        "maintenance_end",
        "notified",
        "error_message"
      ]);
      expect(columns("gcp_accounts")).not.toContain("project_number");
      expect(columns("gcp_operation_logs")).not.toContain("completed_at");
      expect(columns("vps_hosts")).toEqual([
        "id",
        "name",
        "address",
        "port",
        "username",
        "password_ciphertext",
        "role",
        "enabled",
        "created_at",
        "updated_at"
      ]);
      expect(columns("arknights_apk_host_runs")).not.toEqual(
        expect.arrayContaining(["host_port_snapshot", "host_username_snapshot", "attempt_count"])
      );

      const indexes = db
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'index'")
        .all()
        .map((row) => String(row.name));
      expect(indexes).toEqual(
        expect.arrayContaining([
          "idx_gcp_operation_logs_created",
          "idx_vps_hosts_arkhost",
          "idx_arknights_apk_host_runs_status_next_check",
          "idx_arknights_apk_host_runs_status_created",
          "arknights_apk_host_runs_release_id_host_id_unique"
        ])
      );
      expect(indexes).not.toEqual(
        expect.arrayContaining([
          "idx_gcp_operation_logs_batch",
          "idx_gcp_operation_logs_host_created",
          "idx_maintenance_announcements_state_claim"
        ])
      );

      const arkhostIndex = db
        .prepare("SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = ?")
        .get("idx_vps_hosts_arkhost");
      expect(arkhostIndex).toMatchObject({
        sql: expect.stringContaining("WHERE \"vps_hosts\".\"role\" = 'arkhost'")
      });
      const queryPlan = db
        .prepare("EXPLAIN QUERY PLAN SELECT * FROM vps_hosts WHERE role = ? ORDER BY id")
        .all("arkhost")
        .map((row) => String(row.detail));
      expect(queryPlan).toEqual([
        expect.stringContaining("USING INDEX idx_vps_hosts_arkhost")
      ]);
    } finally {
      db.close();
    }
  });

  it("enforces keys and preserves operation and host-run history", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("PRAGMA foreign_keys = ON");
      applySqliteMigrations(db);
      db.exec(`
        INSERT INTO gcp_accounts (
          id, name, project_id, service_account_email,
          workload_identity_provider, default_zone
        ) VALUES (
          1, 'Account', 'project-id', 'service@example.com',
          'provider', 'us-central1-a'
        );
        INSERT INTO vps_hosts (
          id, name, address, port, username, password_ciphertext
        ) VALUES (1, 'Host', '192.0.2.1', 22, 'root', 'ciphertext');
        INSERT INTO arknights_apk_releases (
          id, apk_filename, final_url, detected_at
        ) VALUES (1, 'release.apk', 'https://example.com/release.apk', '2026-01-01T00:00:00.000Z');
        INSERT INTO arknights_apk_host_runs (
          id, release_id, host_id, host_name_snapshot, host_address_snapshot,
          status, created_at, updated_at
        ) VALUES (
          1, 1, 1, 'Host', '192.0.2.1', 'running',
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        );
        INSERT INTO gcp_operation_logs (
          id, batch_id, account_id, account_name_snapshot, project_id, zone,
          instance_name, action, status, created_at
        ) VALUES (
          1, 'batch', 1, 'Account', 'project-id', 'us-central1-a',
          'instance', 'create', 'succeeded', '2026-01-01T00:00:00.000Z'
        );
      `);

      expect(db.prepare("SELECT role FROM vps_hosts WHERE id = 1").get()).toMatchObject({
        role: "redroid"
      });
      expect(() =>
        db.exec(`INSERT INTO vps_hosts (
          name, address, port, username, password_ciphertext, role
        ) VALUES ('Invalid Role', '192.0.2.2', 22, 'root', 'ciphertext', 'other')`)
      ).toThrow();

      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(() =>
        db.exec(`INSERT INTO gcp_accounts (
          name, project_id, service_account_email, workload_identity_provider, default_zone
        ) VALUES ('Duplicate', 'project-id', 'other@example.com', 'provider', 'us-east1-b')`)
      ).toThrow();

      db.exec("DELETE FROM gcp_accounts WHERE id = 1; DELETE FROM vps_hosts WHERE id = 1;");
      expect(
        db.prepare("SELECT account_id FROM gcp_operation_logs WHERE id = 1").get()
      ).toMatchObject({ account_id: null });
      expect(
        db.prepare("SELECT host_id FROM arknights_apk_host_runs WHERE id = 1").get()
      ).toMatchObject({ host_id: null });

      db.exec("DELETE FROM arknights_apk_releases WHERE id = 1");
      expect(db.prepare("SELECT id FROM arknights_apk_host_runs WHERE id = 1").get()).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it("backfills existing VPS rows while applying the role migration", () => {
    const db = new DatabaseSync(":memory:");
    const [initialMigration, roleMigration] = migrationFiles;
    if (!initialMigration || !roleMigration) throw new Error("Expected both database migrations.");
    try {
      db.exec("PRAGMA foreign_keys = ON");
      applySqliteMigrations(db, [initialMigration]);
      db.exec(`
        INSERT INTO vps_hosts (
          id, name, address, port, username, password_ciphertext
        ) VALUES (1, 'Existing Host', '192.0.2.1', 22, 'root', 'ciphertext');
        INSERT INTO arknights_apk_releases (
          id, apk_filename, final_url, detected_at
        ) VALUES (1, 'release.apk', 'https://example.com/release.apk', '2026-01-01T00:00:00.000Z');
        INSERT INTO arknights_apk_host_runs (
          id, release_id, host_id, host_name_snapshot, host_address_snapshot,
          status, created_at, updated_at
        ) VALUES (
          1, 1, 1, 'Existing Host', '192.0.2.1', 'pending',
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        );
      `);

      applySqliteMigrations(db, [roleMigration]);

      expect(db.prepare("SELECT role FROM vps_hosts WHERE id = 1").get()).toMatchObject({
        role: "redroid"
      });
      expect(db.prepare("SELECT host_id FROM arknights_apk_host_runs WHERE id = 1").get())
        .toMatchObject({ host_id: 1 });
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
