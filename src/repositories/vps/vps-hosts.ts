import { asc, eq } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";

import { createDatabase, type Database } from "../../db/client";
import { vpsHosts, type VpsHostRow } from "../../db/schema";
import type {
  AdminVpsHost,
  CreateVpsHost,
  PatchVpsHost,
  ServiceVpsHost
} from "../../schemas/vps/hosts";

export type VpsHostRecord = VpsHostRow;

export function sanitizeAdminHost(record: VpsHostRecord): AdminVpsHost {
  return {
    id: record.id,
    name: record.name,
    address: record.address,
    port: record.port,
    username: record.username,
    enabled: record.enabled,
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
  private readonly db: Database;

  constructor(db: D1Database) {
    this.db = createDatabase(db);
  }

  async listAll(): Promise<VpsHostRecord[]> {
    return this.db.select().from(vpsHosts).orderBy(asc(vpsHosts.id)).all();
  }

  async listEnabled(): Promise<VpsHostRecord[]> {
    return this.db
      .select()
      .from(vpsHosts)
      .where(eq(vpsHosts.enabled, true))
      .orderBy(asc(vpsHosts.id))
      .all();
  }

  async findById(id: number): Promise<VpsHostRecord | null> {
    return (await this.db.select().from(vpsHosts).where(eq(vpsHosts.id, id)).get()) ?? null;
  }

  async create(
    input: CreateVpsHost,
    passwordCiphertext: string,
    enabled = true
  ): Promise<VpsHostRecord | null> {
    const inserted = await this.db
      .insert(vpsHosts)
      .values({
        name: input.name,
        address: input.address,
        port: input.port,
        username: input.username,
        password_ciphertext: passwordCiphertext,
        enabled
      })
      .returning({ id: vpsHosts.id })
      .get();
    return this.findById(inserted.id);
  }

  async patch(id: number, input: PatchVpsHost, passwordCiphertext?: string): Promise<VpsHostRecord | null> {
    const values: SQLiteUpdateSetSource<typeof vpsHosts> = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.port !== undefined ? { port: input.port } : {}),
      ...(input.username !== undefined ? { username: input.username } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(passwordCiphertext !== undefined ? { password_ciphertext: passwordCiphertext } : {})
    };

    if (Object.keys(values).length === 0) return this.findById(id);
    values.updated_at = new Date().toISOString();
    await this.db.update(vpsHosts).set(values).where(eq(vpsHosts.id, id)).run();
    return this.findById(id);
  }

  async delete(id: number): Promise<void> {
    await this.db.delete(vpsHosts).where(eq(vpsHosts.id, id)).run();
  }
}
