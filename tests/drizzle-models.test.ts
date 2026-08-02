import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Env } from "../src/schemas/env";
import {
  createAccount,
  deleteAccount,
  listEnabledAccountRows,
  upsertAccountByProjectId,
  updateAccount
} from "../src/services/gcp/accounts";
import { countOperations, listOperations, recordOperation } from "../src/services/gcp/operations";
import { runRetentionCleanup } from "../src/services/retention";
import {
  claimMaintenanceAnnouncement,
  completeMaintenanceAnnouncement
} from "../src/repositories/maintenance/announcements";
import { VpsHostRepository } from "../src/repositories/vps/vps-hosts";
import {
  countHostRuns,
  countRunsByReleaseIds,
  getHostRun,
  getOrCreateHostRun,
  listDueRunningHostRuns,
  listHostRuns,
  markHostRunStarted,
  updateHostRunReview
} from "../src/repositories/apk-delivery/host-runs";
import { getOrCreateRelease } from "../src/repositories/apk-delivery/releases";
import { applyD1Migrations } from "./helpers/migrations";

describe("Drizzle D1 models", () => {
  let miniflare: Miniflare;
  let db: D1Database;
  let env: Env;

  beforeAll(async () => {
    miniflare = new Miniflare({
      compatibilityDate: "2026-07-14",
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "drizzle-model-tests" }
    });
    db = await miniflare.getD1Database("DB");
    await applyD1Migrations(db);
    env = { DB: db } as Env;
  });

  beforeEach(async () => {
    await db.exec(`
      DELETE FROM arknights_maintenance_host_runs;
      DELETE FROM arknights_apk_host_runs;
      DELETE FROM arknights_apk_releases;
      DELETE FROM arknights_maintenance_announcements;
      DELETE FROM gcp_operation_logs;
      DELETE FROM gcp_accounts;
      DELETE FROM vps_hosts;
    `);
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it("runs typed account and operation queries", async () => {
    const account = await createAccount(env, {
      name: "Primary",
      projectId: "project-one",
      serviceAccountEmail: "service@example.com",
      workloadIdentityProvider: "provider",
      defaultZone: "us-central1-a"
    });
    expect(account.enabled).toBe(true);

    const disabled = await updateAccount(env, account.id, { enabled: false });
    expect(disabled.enabled).toBe(false);
    expect(await listEnabledAccountRows(env)).toEqual([]);

    const upserted = await upsertAccountByProjectId(env, {
      name: "Renamed",
      projectId: "project-one",
      serviceAccountEmail: "new-service@example.com",
      workloadIdentityProvider: "new-provider",
      defaultZone: "us-east1-b"
    });
    expect(upserted).toMatchObject({ created: false, account: { name: "Renamed", enabled: true } });

    await recordOperation(
      env,
      {
        accountId: account.id,
        projectId: "project-one",
        zone: "us-east1-b",
        instanceName: "instance-one",
        action: "create",
        status: "succeeded"
      },
      { batchId: "batch-one", accountId: account.id, accountName: "Renamed" }
    );
    expect(await listOperations(env, 10, 0)).toMatchObject([
      { batchId: "batch-one", accountName: "Renamed", status: "succeeded" }
    ]);
    expect(await countOperations(env)).toBe(1);

    await deleteAccount(env, account.id);
    expect(await listOperations(env, 10, 0)).toMatchObject([{ accountId: null }]);

    await runRetentionCleanup(env, new Date(Date.now() + 366 * 24 * 60 * 60 * 1000));
    expect(await listOperations(env, 10, 0)).toEqual([]);
    expect(await countOperations(env)).toBe(0);
  });

  it("maps VPS booleans and dynamic updates", async () => {
    const repository = new VpsHostRepository(db);
    const host = await repository.create(
      {
        name: "Host One",
        address: "192.0.2.10",
        port: 22,
        username: "root",
        password: "secret",
        role: "redroid"
      },
      "ciphertext",
      false
    );
    expect(host).toMatchObject({
      role: "redroid",
      enabled: false,
      password_ciphertext: "ciphertext"
    });

    const arkhost = await repository.create(
      {
        name: "Arkhost One",
        address: "192.0.2.11",
        port: 22,
        username: "root",
        password: "secret",
        role: "arkhost"
      },
      "ciphertext"
    );

    const updated = await repository.patch(host!.id, { name: "Host Renamed", enabled: true });
    expect(updated).toMatchObject({ name: "Host Renamed", enabled: true });
    expect(await repository.listEnabledByRole("redroid")).toEqual([updated]);
    expect(await repository.listEnabledByRole("arkhost")).toEqual([arkhost]);
  });

  it("runs host-run conflicts, scheduling, and aggregations", async () => {
    const host = await new VpsHostRepository(db).create(
      {
        name: "Deploy Host",
        address: "192.0.2.20",
        port: 22,
        username: "root",
        password: "secret",
        role: "redroid"
      },
      "ciphertext"
    );
    const release = await getOrCreateRelease(
      db,
      "release.apk",
      "https://example.com/release.apk",
      "2026-07-16T00:00:00.000Z"
    );
    const run = await getOrCreateHostRun(db, release.id, host!, "2026-07-16T00:00:00.000Z");
    const duplicate = await getOrCreateHostRun(db, release.id, host!, "2026-07-16T00:01:00.000Z");
    expect(duplicate.id).toBe(run.id);
    expect(await countHostRuns(db, ["pending", "running"])).toBe(1);
    expect(await listHostRuns(db, ["pending", "running"], 10, 0)).toHaveLength(1);
    expect(await countRunsByReleaseIds(db, [release.id])).toEqual({
      [release.id]: { pending: 1 }
    });

    await markHostRunStarted(
      db,
      run.id,
      "2026-07-16T00:05:00.000Z",
      "2026-07-16T00:10:00.000Z",
      "2026-07-16T06:05:00.000Z"
    );
    expect(await listDueRunningHostRuns(db, "2026-07-16T00:10:00.000Z")).toHaveLength(1);

    await updateHostRunReview(db, run.id, {
      status: "succeeded",
      now: "2026-07-16T00:11:00.000Z",
      logTail: "done",
      aiStatus: "success",
      aiReason: "completed",
      nextCheckAt: null,
      errorMessage: null
    });
    expect(await getHostRun(db, run.id)).toMatchObject({
      status: "succeeded",
      last_ai_status: "success",
      last_ai_reason: "completed"
    });
    expect(await countHostRuns(db, ["pending", "running"])).toBe(0);
    expect(await countHostRuns(db, undefined)).toBe(1);
  });

  it("claims maintenance announcements once and persists terminal outcomes", async () => {
    const link = { id: "009692", url: "https://ak.hypergryph.com/news/9692" };
    expect(await claimMaintenanceAnnouncement(db, link, "2026-07-18T15:00:00.000Z")).toBe(true);
    expect(await claimMaintenanceAnnouncement(db, link, "2026-07-18T15:01:00.000Z")).toBe(false);

    const staleLink = { id: "9693", url: "https://ak.hypergryph.com/news/9693" };
    await claimMaintenanceAnnouncement(db, staleLink, "2026-07-18T15:00:00.000Z");
    expect(await claimMaintenanceAnnouncement(db, staleLink, "2026-07-18T15:02:00.000Z")).toBe(
      false
    );
    expect(
      await db
        .prepare(
          "SELECT processing_state FROM arknights_maintenance_announcements WHERE news_id = ?"
        )
        .bind(staleLink.id)
        .first()
    ).toEqual({ processing_state: "processing" });

    await completeMaintenanceAnnouncement(db, link.id, {
      processingState: "completed",
      processedAt: "2026-07-18T15:02:00.000Z",
      title: "版本更新停机维护公告",
      isMaintenance: true,
      maintenanceStart: "2026年05月01日06:00",
      maintenanceEnd: "12:00",
      notified: true,
      errorMessage: null
    });

    const row = await db
      .prepare(
        "SELECT processing_state, notified, error_message FROM arknights_maintenance_announcements WHERE news_id = ?"
      )
      .bind(link.id)
      .first();
    expect(row).toEqual({ processing_state: "completed", notified: 1, error_message: null });
  });
});
