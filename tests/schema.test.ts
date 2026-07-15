import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8");
const unifiedVpsMigration = readFileSync(
  new URL("../migrations/0002_unified_vps.sql", import.meta.url),
  "utf8"
);

describe("control database baseline", () => {
  it("defines only the eight control tables", () => {
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

  it("adds stable cloud identity without changing host ownership", () => {
    expect(unifiedVpsMigration).toContain("gcp_account_id INTEGER REFERENCES gcp_accounts(id) ON DELETE RESTRICT");
    expect(unifiedVpsMigration).toContain("gcp_project_id TEXT");
    expect(unifiedVpsMigration).toContain("gcp_zone TEXT");
    expect(unifiedVpsMigration).toContain("gcp_instance_name TEXT");
    expect(unifiedVpsMigration).toContain("CREATE UNIQUE INDEX idx_vps_hosts_gcp_identity");
    expect(unifiedVpsMigration).toContain("host_id INTEGER REFERENCES vps_hosts(id) ON DELETE SET NULL");
  });
});
