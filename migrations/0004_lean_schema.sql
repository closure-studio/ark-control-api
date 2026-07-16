PRAGMA defer_foreign_keys = ON;

DROP TABLE watcher_ai_reviews;

CREATE TABLE lean_gcp_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  project_id TEXT NOT NULL UNIQUE,
  service_account_email TEXT NOT NULL,
  workload_identity_provider TEXT NOT NULL,
  default_zone TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO lean_gcp_accounts (
  id, name, project_id, service_account_email, workload_identity_provider,
  default_zone, enabled, created_at, updated_at
)
SELECT
  id, name, project_id, service_account_email, workload_identity_provider,
  default_zone, enabled, created_at, updated_at
FROM gcp_accounts;

CREATE TABLE lean_gcp_instance_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  account_id INTEGER,
  account_name_snapshot TEXT,
  project_id TEXT NOT NULL,
  zone TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'start', 'stop', 'delete')),
  status TEXT NOT NULL CHECK (status IN ('skipped', 'submitted', 'succeeded', 'failed')),
  google_operation_name TEXT,
  message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES lean_gcp_accounts(id) ON DELETE SET NULL
);

INSERT INTO lean_gcp_instance_operations (
  id, batch_id, account_id, account_name_snapshot, project_id, zone,
  instance_name, action, status, google_operation_name, message, created_at
)
SELECT
  id, batch_id, account_id, account_name_snapshot, project_id, zone,
  instance_name, action, status, google_operation_name, message, created_at
FROM gcp_instance_operations;

DROP TABLE gcp_instance_operations;
DROP TABLE gcp_accounts;
ALTER TABLE lean_gcp_accounts RENAME TO gcp_accounts;
ALTER TABLE lean_gcp_instance_operations RENAME TO gcp_instance_operations;

CREATE INDEX idx_gcp_instance_operations_account_created
  ON gcp_instance_operations(account_id, created_at);
CREATE INDEX idx_gcp_instance_operations_created
  ON gcp_instance_operations(created_at);

CREATE TABLE lean_watcher_deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id INTEGER NOT NULL,
  host_id INTEGER,
  host_name_snapshot TEXT NOT NULL,
  host_address_snapshot TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'timed_out')),
  failure_stage TEXT CHECK (failure_stage IS NULL OR failure_stage IN ('start', 'ssh', 'ai', 'deadline')),
  started_at TEXT,
  next_check_at TEXT,
  deadline_at TEXT,
  last_checked_at TEXT,
  finished_at TEXT,
  last_log_tail TEXT,
  last_ai_status TEXT CHECK (last_ai_status IS NULL OR last_ai_status IN ('success', 'running', 'failed', 'unknown')),
  last_ai_reason TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES watcher_releases(id) ON DELETE CASCADE,
  FOREIGN KEY (host_id) REFERENCES vps_hosts(id) ON DELETE SET NULL,
  UNIQUE (release_id, host_id)
);

INSERT INTO lean_watcher_deployments (
  id, release_id, host_id, host_name_snapshot, host_address_snapshot, status,
  failure_stage, started_at, next_check_at, deadline_at, last_checked_at,
  finished_at, last_log_tail, last_ai_status, last_ai_reason, error_message,
  created_at, updated_at
)
SELECT
  id, release_id, host_id, host_name_snapshot, host_address_snapshot, status,
  failure_stage, started_at, next_check_at, deadline_at, last_checked_at,
  finished_at, last_log_tail, last_ai_status, last_ai_reason, error_message,
  created_at, updated_at
FROM watcher_deployments;

DROP TABLE watcher_deployments;
ALTER TABLE lean_watcher_deployments RENAME TO watcher_deployments;

CREATE INDEX idx_watcher_deployments_status_next_check
  ON watcher_deployments(status, next_check_at);
CREATE INDEX idx_watcher_deployments_status_created
  ON watcher_deployments(status, created_at, id);

PRAGMA defer_foreign_keys = OFF;
PRAGMA optimize;
