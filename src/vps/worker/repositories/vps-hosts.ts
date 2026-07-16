import type {
  AdminVpsHost,
  CreateVpsHostRequest,
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
  enabled: number;
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
    enabled: record.enabled === 1,
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

  async create(
    input: Required<CreateVpsHostRequest>,
    passwordCiphertext: string
  ): Promise<VpsHostRecord | null> {
    const result = await this.db
      .prepare(
        `INSERT INTO vps_hosts (
          name, address, port, username, password_ciphertext
        ) VALUES (?, ?, ?, ?, ?)`
      )
      .bind(
        input.name,
        input.address,
        input.port,
        input.username,
        passwordCiphertext
      )
      .run();
    return this.findById(Number(result.meta.last_row_id));
  }

  async patch(id: number, input: PatchVpsHostRequest, passwordCiphertext?: string): Promise<VpsHostRecord | null> {
    const assignments: string[] = [];
    const bindings: unknown[] = [];
    add(assignments, bindings, "name", input.name);
    add(assignments, bindings, "address", input.address);
    add(assignments, bindings, "port", input.port);
    add(assignments, bindings, "username", input.username);
    add(assignments, bindings, "enabled", input.enabled === undefined ? undefined : input.enabled ? 1 : 0);
    add(assignments, bindings, "password_ciphertext", passwordCiphertext);

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
