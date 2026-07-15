ALTER TABLE vps_hosts ADD COLUMN gcp_account_id INTEGER REFERENCES gcp_accounts(id) ON DELETE RESTRICT;
ALTER TABLE vps_hosts ADD COLUMN gcp_project_id TEXT;
ALTER TABLE vps_hosts ADD COLUMN gcp_zone TEXT;
ALTER TABLE vps_hosts ADD COLUMN gcp_instance_name TEXT;

CREATE INDEX idx_vps_hosts_gcp_account
  ON vps_hosts(gcp_account_id)
  WHERE gcp_account_id IS NOT NULL;

CREATE UNIQUE INDEX idx_vps_hosts_gcp_identity
  ON vps_hosts(gcp_project_id, gcp_zone, gcp_instance_name)
  WHERE gcp_project_id IS NOT NULL
    AND gcp_zone IS NOT NULL
    AND gcp_instance_name IS NOT NULL;

ALTER TABLE gcp_instance_operations ADD COLUMN host_id INTEGER REFERENCES vps_hosts(id) ON DELETE SET NULL;
CREATE INDEX idx_gcp_instance_operations_host_created
  ON gcp_instance_operations(host_id, created_at);

PRAGMA optimize;
