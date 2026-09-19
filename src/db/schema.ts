import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

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

export const gcpOperationLogs = sqliteTable(
  "gcp_operation_logs",
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
      "gcp_operation_logs_action_check",
      sql`${table.action} IN ('create', 'start', 'stop', 'delete')`
    ),
    check(
      "gcp_operation_logs_status_check",
      sql`${table.status} IN ('skipped', 'submitted', 'succeeded', 'failed')`
    ),
    index("idx_gcp_operation_logs_account_created").on(table.account_id, table.created_at),
    index("idx_gcp_operation_logs_created").on(table.created_at)
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
    role: text("role", { enum: ["redroid", "arkhost"] })
      .notNull()
      .default("redroid"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    created_at: text("created_at").notNull().default(isoTimestampDefault),
    updated_at: text("updated_at").notNull().default(isoTimestampDefault)
  },
  (table) => [
    check("vps_hosts_port_check", sql`${table.port} BETWEEN 1 AND 65535`),
    check("vps_hosts_role_check", sql`${table.role} IN ('redroid', 'arkhost')`),
    check("vps_hosts_enabled_check", sql`${table.enabled} IN (0, 1)`),
    index("idx_vps_hosts_arkhost")
      .on(table.id)
      .where(sql`${table.role} = 'arkhost'`),
    unique("vps_hosts_address_port_username_unique").on(table.address, table.port, table.username)
  ]
);

export const arknightsApkReleases = sqliteTable(
  "arknights_apk_releases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    apk_filename: text("apk_filename").notNull().unique(),
    final_url: text("final_url").notNull(),
    detected_at: text("detected_at").notNull()
  },
  (table) => [index("idx_arknights_apk_releases_detected").on(table.detected_at)]
);

export const arknightsApkHostRuns = sqliteTable(
  "arknights_apk_host_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    release_id: integer("release_id")
      .notNull()
      .references(() => arknightsApkReleases.id, { onDelete: "cascade" }),
    host_id: integer("host_id").references(() => vpsHosts.id, { onDelete: "set null" }),
    host_name_snapshot: text("host_name_snapshot").notNull(),
    host_address_snapshot: text("host_address_snapshot").notNull(),
    status: text("status", {
      enum: ["pending", "running", "succeeded", "failed", "timed_out"]
    }).notNull(),
    started_at: text("started_at"),
    next_check_at: text("next_check_at"),
    deadline_at: text("deadline_at"),
    last_checked_at: text("last_checked_at"),
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
      "arknights_apk_host_runs_status_check",
      sql`${table.status} IN ('pending', 'running', 'succeeded', 'failed', 'timed_out')`
    ),
    check(
      "arknights_apk_host_runs_last_ai_status_check",
      sql`${table.last_ai_status} IS NULL OR ${table.last_ai_status} IN ('success', 'running', 'failed', 'unknown')`
    ),
    unique("arknights_apk_host_runs_release_id_host_id_unique").on(table.release_id, table.host_id),
    index("idx_arknights_apk_host_runs_status_next_check").on(table.status, table.next_check_at),
    index("idx_arknights_apk_host_runs_status_created").on(table.status, table.created_at, table.id)
  ]
);

export const arknightsMaintenanceAnnouncements = sqliteTable(
  "arknights_maintenance_announcements",
  {
    news_id: text("news_id").primaryKey(),
    url: text("url").notNull(),
    processing_state: text("processing_state", {
      enum: ["processing", "completed", "failed"]
    }).notNull(),
    first_seen_at: text("first_seen_at").notNull(),
    processed_at: text("processed_at"),
    title: text("title"),
    is_maintenance: integer("is_maintenance", { mode: "boolean" }),
    maintenance_start: text("maintenance_start"),
    maintenance_end: text("maintenance_end"),
    maintenance_start_at: text("maintenance_start_at"),
    pre_action_at: text("pre_action_at"),
    pre_action_state: text("pre_action_state", {
      enum: ["pending", "processing", "completed", "failed", "unschedulable"]
    })
      .notNull()
      .default("unschedulable"),
    pre_action_started_at: text("pre_action_started_at"),
    pre_action_completed_at: text("pre_action_completed_at"),
    pre_action_failed_step: text("pre_action_failed_step", {
      enum: ["schedule", "auth", "config", "host_inventory", "ssh", "missed", "interrupted"]
    }),
    pre_action_error_message: text("pre_action_error_message"),
    notified: integer("notified", { mode: "boolean" }).notNull().default(false),
    error_message: text("error_message")
  },
  (table) => [
    check(
      "arknights_maintenance_announcements_state_check",
      sql`${table.processing_state} IN ('processing', 'completed', 'failed')`
    ),
    check("arknights_maintenance_announcements_notified_check", sql`${table.notified} IN (0, 1)`),
    check(
      "arknights_maintenance_announcements_pre_action_state_check",
      sql`${table.pre_action_state} IN ('pending', 'processing', 'completed', 'failed', 'unschedulable')`
    ),
    check(
      "arknights_maintenance_announcements_pre_action_failed_step_check",
      sql`${table.pre_action_failed_step} IS NULL OR ${table.pre_action_failed_step} IN ('schedule', 'auth', 'config', 'host_inventory', 'ssh', 'missed', 'interrupted')`
    ),
    index("idx_maintenance_pre_action_due").on(
      table.processing_state,
      table.pre_action_state,
      table.pre_action_at
    )
  ]
);

export const arknightsMaintenanceHostRuns = sqliteTable(
  "arknights_maintenance_host_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    announcement_news_id: text("announcement_news_id")
      .notNull()
      .references(() => arknightsMaintenanceAnnouncements.news_id, { onDelete: "cascade" }),
    host_id: integer("host_id").references(() => vpsHosts.id, { onDelete: "set null" }),
    host_name_snapshot: text("host_name_snapshot").notNull(),
    host_address_snapshot: text("host_address_snapshot").notNull(),
    status: text("status", {
      enum: ["running", "succeeded", "failed", "timed_out"]
    }).notNull(),
    connected: integer("connected", { mode: "boolean" }),
    timed_out: integer("timed_out", { mode: "boolean" }),
    exit_code: integer("exit_code"),
    error_message: text("error_message"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    check(
      "arknights_maintenance_host_runs_status_check",
      sql`${table.status} IN ('running', 'succeeded', 'failed', 'timed_out')`
    ),
    check(
      "arknights_maintenance_host_runs_connected_check",
      sql`${table.connected} IS NULL OR ${table.connected} IN (0, 1)`
    ),
    check(
      "arknights_maintenance_host_runs_timed_out_check",
      sql`${table.timed_out} IS NULL OR ${table.timed_out} IN (0, 1)`
    ),
    index("idx_maintenance_host_runs_announcement").on(table.announcement_news_id),
    index("idx_maintenance_host_runs_status").on(table.status)
  ]
);

export const publicAnnouncements = sqliteTable("public_announcements", {
  news_id: text("news_id").primaryKey(),
  source_url: text("source_url").notNull(),
  title: text("title").notNull(),
  published_at: text("published_at"),
  content_hash: text("content_hash").notNull(),
  windows_json: text("windows_json").notNull(),
  fetched_at: text("fetched_at").notNull(),
  recheck_at: text("recheck_at").notNull()
});

export const publicAnnouncementCollection = sqliteTable("public_announcement_collection", {
  source_id: text("source_id").primaryKey(),
  last_attempt_at: text("last_attempt_at").notNull(),
  last_success_at: text("last_success_at"),
  status: text("status", { enum: ["ready", "partial", "failed"] }).notNull(),
  error_code: text("error_code"),
  retry_at: text("retry_at")
});

export type GcpAccountRow = typeof gcpAccounts.$inferSelect;
export type VpsHostRow = typeof vpsHosts.$inferSelect;
export type ArknightsApkReleaseRow = typeof arknightsApkReleases.$inferSelect;
export type ArknightsApkHostRunRow = typeof arknightsApkHostRuns.$inferSelect;
export type ArknightsMaintenanceAnnouncementRow =
  typeof arknightsMaintenanceAnnouncements.$inferSelect;
export type ArknightsMaintenanceHostRunRow = typeof arknightsMaintenanceHostRuns.$inferSelect;
