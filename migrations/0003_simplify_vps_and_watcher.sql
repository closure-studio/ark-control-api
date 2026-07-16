DROP INDEX IF EXISTS idx_vps_hosts_gcp_account;
DROP INDEX IF EXISTS idx_vps_hosts_gcp_identity;

ALTER TABLE vps_hosts DROP COLUMN verify_command;
ALTER TABLE vps_hosts DROP COLUMN password_updated_at;
ALTER TABLE vps_hosts DROP COLUMN gcp_account_id;
ALTER TABLE vps_hosts DROP COLUMN gcp_project_id;
ALTER TABLE vps_hosts DROP COLUMN gcp_zone;
ALTER TABLE vps_hosts DROP COLUMN gcp_instance_name;

DROP TABLE watcher_release_checks;

PRAGMA optimize;
