CREATE TABLE gcp_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  project_id TEXT NOT NULL UNIQUE,
  project_number TEXT NOT NULL UNIQUE,
  service_account_email TEXT NOT NULL,
  workload_identity_provider TEXT NOT NULL,
  default_zone TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE gcp_instance_operations (
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
  completed_at TEXT,
  FOREIGN KEY (account_id) REFERENCES gcp_accounts(id) ON DELETE SET NULL
);

CREATE INDEX idx_gcp_instance_operations_account_created
  ON gcp_instance_operations(account_id, created_at);
CREATE INDEX idx_gcp_instance_operations_created
  ON gcp_instance_operations(created_at);
CREATE INDEX idx_gcp_instance_operations_batch
  ON gcp_instance_operations(batch_id);

CREATE TABLE vps_hosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22 CHECK (port BETWEEN 1 AND 65535),
  username TEXT NOT NULL,
  password_ciphertext TEXT NOT NULL,
  verify_command TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  password_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (address, port, username)
);

CREATE TABLE control_job_locks (
  job_name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE watcher_releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  apk_filename TEXT NOT NULL UNIQUE,
  final_url TEXT NOT NULL,
  detected_at TEXT NOT NULL
);

CREATE INDEX idx_watcher_releases_detected
  ON watcher_releases(detected_at);

CREATE TABLE watcher_release_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outcome TEXT NOT NULL CHECK (outcome IN ('unchanged', 'release_created', 'failed')),
  final_url TEXT,
  apk_filename TEXT,
  release_id INTEGER,
  error_message TEXT,
  checked_at TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES watcher_releases(id) ON DELETE SET NULL
);

CREATE INDEX idx_watcher_release_checks_checked
  ON watcher_release_checks(checked_at);
CREATE INDEX idx_watcher_release_checks_outcome_checked
  ON watcher_release_checks(outcome, checked_at);

CREATE TABLE watcher_deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id INTEGER NOT NULL,
  host_id INTEGER,
  host_name_snapshot TEXT NOT NULL,
  host_address_snapshot TEXT NOT NULL,
  host_port_snapshot INTEGER NOT NULL,
  host_username_snapshot TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'timed_out')),
  failure_stage TEXT CHECK (failure_stage IS NULL OR failure_stage IN ('start', 'ssh', 'ai', 'deadline')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
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

CREATE INDEX idx_watcher_deployments_status_next_check
  ON watcher_deployments(status, next_check_at);
CREATE INDEX idx_watcher_deployments_status_created
  ON watcher_deployments(status, created_at, id);

CREATE TABLE watcher_ai_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'running', 'failed', 'unknown')),
  response_valid INTEGER NOT NULL CHECK (response_valid IN (0, 1)),
  reason TEXT NOT NULL,
  raw_response TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (deployment_id) REFERENCES watcher_deployments(id) ON DELETE CASCADE
);

CREATE INDEX idx_watcher_ai_reviews_deployment_created
  ON watcher_ai_reviews(deployment_id, created_at);

PRAGMA optimize;
