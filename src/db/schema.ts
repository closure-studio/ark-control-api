import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  unique
} from "drizzle-orm/sqlite-core";

const isoTimestampDefault = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const gcpAccounts = sqliteTable(
  "gcp_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    project_id: text("project_id").notNull().unique(),
    service_account_email: text("service_account_email").notNull(),
    workload_identity_provider: text("workload_identity_provider").notNull(),
    default_zone: text("default_zone").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    created_at: text("created_at").notNull().default(isoTimestampDefault),
    updated_at: text("updated_at").notNull().default(isoTimestampDefault)
  },
  (table) => [check("gcp_accounts_enabled_check", sql`${table.enabled} IN (0, 1)`)]
);

export const gcpInstanceOperations = sqliteTable(
  "gcp_instance_operations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    batch_id: text("batch_id").notNull(),
    account_id: integer("account_id").references(() => gcpAccounts.id, { onDelete: "set null" }),
    account_name_snapshot: text("account_name_snapshot"),
    project_id: text("project_id").notNull(),
    zone: text("zone").notNull(),
    instance_name: text("instance_name").notNull(),
    action: text("action", { enum: ["create", "start", "stop", "delete"] }).notNull(),
    status: text("status", {
      enum: ["skipped", "submitted", "succeeded", "failed"]
    }).notNull(),
    google_operation_name: text("google_operation_name"),
    message: text("message"),
    created_at: text("created_at").notNull()
  },
  (table) => [
    check(
      "gcp_instance_operations_action_check",
      sql`${table.action} IN ('create', 'start', 'stop', 'delete')`
    ),
    check(
      "gcp_instance_operations_status_check",
      sql`${table.status} IN ('skipped', 'submitted', 'succeeded', 'failed')`
    ),
    index("idx_gcp_instance_operations_account_created").on(table.account_id, table.created_at),
    index("idx_gcp_instance_operations_created").on(table.created_at)
  ]
);

export const vpsHosts = sqliteTable(
  "vps_hosts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    address: text("address").notNull(),
    port: integer("port").notNull().default(22),
    username: text("username").notNull(),
    password_ciphertext: text("password_ciphertext").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    created_at: text("created_at").notNull().default(isoTimestampDefault),
    updated_at: text("updated_at").notNull().default(isoTimestampDefault)
  },
  (table) => [
    check("vps_hosts_port_check", sql`${table.port} BETWEEN 1 AND 65535`),
    check("vps_hosts_enabled_check", sql`${table.enabled} IN (0, 1)`),
    unique("vps_hosts_address_port_username_unique").on(
      table.address,
      table.port,
      table.username
    )
  ]
);

export const controlJobLocks = sqliteTable("control_job_locks", {
  job_name: text("job_name").primaryKey(),
  owner: text("owner").notNull(),
  acquired_at: text("acquired_at").notNull(),
  expires_at: text("expires_at").notNull()
});

export const watcherReleases = sqliteTable(
  "watcher_releases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    apk_filename: text("apk_filename").notNull().unique(),
    final_url: text("final_url").notNull(),
    detected_at: text("detected_at").notNull()
  },
  (table) => [index("idx_watcher_releases_detected").on(table.detected_at)]
);

export const watcherDeployments = sqliteTable(
  "watcher_deployments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    release_id: integer("release_id")
      .notNull()
      .references(() => watcherReleases.id, { onDelete: "cascade" }),
    host_id: integer("host_id").references(() => vpsHosts.id, { onDelete: "set null" }),
    host_name_snapshot: text("host_name_snapshot").notNull(),
    host_address_snapshot: text("host_address_snapshot").notNull(),
    status: text("status", {
      enum: ["pending", "running", "succeeded", "failed", "timed_out"]
    }).notNull(),
    failure_stage: text("failure_stage", { enum: ["start", "ssh", "ai", "deadline"] }),
    started_at: text("started_at"),
    next_check_at: text("next_check_at"),
    deadline_at: text("deadline_at"),
    last_checked_at: text("last_checked_at"),
    finished_at: text("finished_at"),
    last_log_tail: text("last_log_tail"),
    last_ai_status: text("last_ai_status", {
      enum: ["success", "running", "failed", "unknown"]
    }),
    last_ai_reason: text("last_ai_reason"),
    error_message: text("error_message"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    check(
      "watcher_deployments_status_check",
      sql`${table.status} IN ('pending', 'running', 'succeeded', 'failed', 'timed_out')`
    ),
    check(
      "watcher_deployments_failure_stage_check",
      sql`${table.failure_stage} IS NULL OR ${table.failure_stage} IN ('start', 'ssh', 'ai', 'deadline')`
    ),
    check(
      "watcher_deployments_last_ai_status_check",
      sql`${table.last_ai_status} IS NULL OR ${table.last_ai_status} IN ('success', 'running', 'failed', 'unknown')`
    ),
    unique("watcher_deployments_release_id_host_id_unique").on(
      table.release_id,
      table.host_id
    ),
    index("idx_watcher_deployments_status_next_check").on(
      table.status,
      table.next_check_at
    ),
    index("idx_watcher_deployments_status_created").on(
      table.status,
      table.created_at,
      table.id
    )
  ]
);

export type GcpAccountRow = typeof gcpAccounts.$inferSelect;
export type GcpVmOperationRow = typeof gcpInstanceOperations.$inferSelect;
export type VpsHostRow = typeof vpsHosts.$inferSelect;
export type WatcherReleaseRow = typeof watcherReleases.$inferSelect;
export type WatcherDeploymentRow = typeof watcherDeployments.$inferSelect;
