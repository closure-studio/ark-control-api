import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as v from "valibot";

import { api } from "../src";
import type { Env } from "../src/schemas/env";
import { GcpOperationsResponseSchema } from "../src/schemas/gcp/responses";
import { RunListResponseSchema } from "../src/schemas/watcher/responses";
import { recordOperation } from "../src/services/gcp/operations";
import { VpsHostRepository } from "../src/repositories/vps/vps-hosts";
import { getOrCreateHostRun } from "../src/repositories/watcher/host-runs";
import { getOrCreateRelease } from "../src/repositories/watcher/releases";
import { applyD1Migrations } from "./helpers/migrations";

const AUTHORIZATION_HEADERS = { authorization: "Bearer secret" };

describe("atomic query routes", () => {
  let miniflare: Miniflare;
  let db: D1Database;
  let env: Env;

  beforeAll(async () => {
    miniflare = new Miniflare({
      compatibilityDate: "2026-07-14",
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "query-route-tests" }
    });
    db = await miniflare.getD1Database("DB");
    await applyD1Migrations(db);
    env = { DB: db, ADMIN_TOKEN: "secret" } as Env;
  });

  beforeEach(async () => {
    await db.exec(`
      DELETE FROM arknights_apk_deployments;
      DELETE FROM arknights_apk_releases;
      DELETE FROM gcp_operation_logs;
      DELETE FROM vps_hosts;
    `);
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it("lists operations through the authenticated API", async () => {
    await recordOperation(
      env,
      {
        accountId: 7,
        projectId: "project-one",
        zone: "us-central1-a",
        instanceName: "instance-one",
        action: "start",
        status: "submitted"
      },
      { batchId: "batch-one", accountId: null }
    );

    const response = await api.request(
      "https://control.example.com/api/operations?limit=1&offset=0",
      { headers: AUTHORIZATION_HEADERS },
      env
    );
    expect(response.status).toBe(200);
    const result = v.safeParse(
      v.object({ data: GcpOperationsResponseSchema }),
      await response.json()
    );
    expect(result).toMatchObject({
      success: true,
      output: { data: {
        operations: [{ batchId: "batch-one", status: "submitted" }],
        pagination: { limit: 1, offset: 0, count: 1, total: 1 }
      } }
    });
  });

  it("filters active runs and reports the filtered total", async () => {
    const host = await new VpsHostRepository(db).create(
      {
        name: "Active Host",
        address: "192.0.2.50",
        port: 22,
        username: "root",
        password: "secret"
      },
      "ciphertext"
    );
    const release = await getOrCreateRelease(
      db,
      "active.apk",
      "https://example.com/active.apk",
      "2026-07-19T00:00:00.000Z"
    );
    await getOrCreateHostRun(db, release.id, host!, "2026-07-19T00:00:00.000Z");

    const response = await api.request(
      "https://control.example.com/api/runs?state=active&limit=1&offset=0",
      { headers: AUTHORIZATION_HEADERS },
      env
    );
    expect(response.status).toBe(200);
    const result = v.safeParse(
      v.object({ data: RunListResponseSchema }),
      await response.json()
    );
    expect(result).toMatchObject({
      success: true,
      output: { data: {
        runs: [{ status: "pending", hostName: "Active Host" }],
        pagination: { limit: 1, offset: 0, count: 1, total: 1 }
      } }
    });
  });

  it("rejects invalid run filters and no longer exposes dashboard", async () => {
    const invalid = await api.request(
      "https://control.example.com/api/runs?state=busy",
      { headers: AUTHORIZATION_HEADERS },
      env
    );
    expect(invalid.status).toBe(400);

    const dashboard = await api.request(
      "https://control.example.com/api/dashboard",
      { headers: AUTHORIZATION_HEADERS },
      env
    );
    expect(dashboard.status).toBe(404);
  });
});
