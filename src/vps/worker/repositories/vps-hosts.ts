import type {
  AdminVpsHost,
  CreateVpsHostRequest,
  GcpHostIdentity,
  PatchVpsHostRequest,
  ServiceVpsHost
} from "../../shared/types/vps-hosts";

export interface VpsHostRecord {
  id: number;
  name: string;
  address: string;
  port: number;
  username: string;
  password_ciphertext: string;
  verify_command: string | null;
  enabled: number;
  gcp_account_id: number | null;
  gcp_project_id: string | null;
  gcp_zone: string | null;
  gcp_instance_name: string | null;
  password_updated_at: string;
  created_at: string;
  updated_at: string;
}

export function sanitizeAdminHost(record: VpsHostRecord): AdminVpsHost {
  return {
    id: record.id,
    name: record.name,
    address: record.address,
    port: record.port,
    username: record.username,
    verify_command: record.verify_command,
    enabled: record.enabled === 1,
    gcp_account_id: record.gcp_account_id,
    gcp_project_id: record.gcp_project_id,
    gcp_zone: record.gcp_zone,
    gcp_instance_name: record.gcp_instance_name,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

export function sanitizeServiceHost(record: VpsHostRecord): ServiceVpsHost {
  return {
    ...sanitizeAdminHost(record),
    password_ciphertext: record.password_ciphertext
  };
}

export class VpsHostRepository {
  constructor(private readonly db: D1Database) {}

  async listAll(): Promise<VpsHostRecord[]> {
    const result = await this.db.prepare("SELECT * FROM vps_hosts ORDER BY id ASC").all<VpsHostRecord>();
    return result.results;
  }

  async listEnabled(): Promise<VpsHostRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM vps_hosts WHERE enabled = 1 ORDER BY id ASC")
      .all<VpsHostRecord>();
    return result.results;
  }

  async findById(id: number): Promise<VpsHostRecord | null> {
    return this.db.prepare("SELECT * FROM vps_hosts WHERE id = ?").bind(id).first<VpsHostRecord>();
  }

  async listByGcpAccountId(accountId: number): Promise<VpsHostRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM vps_hosts WHERE gcp_account_id = ? ORDER BY id ASC")
      .bind(accountId)
      .all<VpsHostRecord>();
    return result.results;
  }

  async listUnlinked(): Promise<VpsHostRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM vps_hosts WHERE gcp_account_id IS NULL ORDER BY id ASC")
      .all<VpsHostRecord>();
    return result.results;
  }

  async findByCloudIdentity(identity: Omit<GcpHostIdentity, "accountId">): Promise<VpsHostRecord | null> {
    return this.db
      .prepare(
        "SELECT * FROM vps_hosts WHERE gcp_project_id = ? AND gcp_zone = ? AND gcp_instance_name = ? LIMIT 1"
      )
      .bind(identity.projectId, identity.zone, identity.instanceName)
      .first<VpsHostRecord>();
  }

  async create(
    input: Required<CreateVpsHostRequest>,
    passwordCiphertext: string,
    cloud: GcpHostIdentity | null = null
  ): Promise<VpsHostRecord | null> {
    const result = await this.db
      .prepare(
        `INSERT INTO vps_hosts (
          name, address, port, username, password_ciphertext, verify_command,
          gcp_account_id, gcp_project_id, gcp_zone, gcp_instance_name, password_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.name,
        input.address,
        input.port,
        input.username,
        passwordCiphertext,
        input.verify_command,
        cloud?.accountId ?? null,
        cloud?.projectId ?? null,
        cloud?.zone ?? null,
        cloud?.instanceName ?? null,
        new Date().toISOString()
      )
      .run();
    return this.findById(Number(result.meta.last_row_id));
  }

  async linkToCloud(id: number, identity: GcpHostIdentity): Promise<VpsHostRecord | null> {
    await this.db
      .prepare(
        `UPDATE vps_hosts
         SET gcp_account_id = ?, gcp_project_id = ?, gcp_zone = ?, gcp_instance_name = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND gcp_account_id IS NULL`
      )
      .bind(identity.accountId, identity.projectId, identity.zone, identity.instanceName, id)
      .run();
    return this.findById(id);
  }

  async updateAddress(id: number, address: string): Promise<VpsHostRecord | null> {
    await this.db
      .prepare(
        "UPDATE vps_hosts SET address = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .bind(address, id)
      .run();
    return this.findById(id);
  }

  async patch(id: number, input: PatchVpsHostRequest, passwordCiphertext?: string): Promise<VpsHostRecord | null> {
    const assignments: string[] = [];
    const bindings: unknown[] = [];
    add(assignments, bindings, "name", input.name);
    add(assignments, bindings, "address", input.address);
    add(assignments, bindings, "port", input.port);
    add(assignments, bindings, "username", input.username);
    add(assignments, bindings, "verify_command", input.verify_command);
    add(assignments, bindings, "enabled", input.enabled === undefined ? undefined : input.enabled ? 1 : 0);
    add(assignments, bindings, "password_ciphertext", passwordCiphertext);
    if (passwordCiphertext !== undefined) {
      add(assignments, bindings, "password_updated_at", new Date().toISOString());
    }

    if (assignments.length === 0) return this.findById(id);
    assignments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    bindings.push(id);
    await this.db.prepare(`UPDATE vps_hosts SET ${assignments.join(", ")} WHERE id = ?`).bind(...bindings).run();
    return this.findById(id);
  }

  async delete(id: number): Promise<void> {
    await this.db.prepare("DELETE FROM vps_hosts WHERE id = ?").bind(id).run();
  }
}

function add(assignments: string[], bindings: unknown[], column: string, value: unknown): void {
  if (value === undefined) return;
  assignments.push(`${column} = ?`);
  bindings.push(value);
}
