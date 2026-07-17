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
import {
  listRecentOperations,
  recordOperation
} from "../src/services/gcp/operations";
import { runRetentionCleanup } from "../src/services/retention";
import { VpsHostRepository } from "../src/repositories/vps/vps-hosts";
import { acquireAppStateLock, releaseAppStateLock } from "../src/repositories/watcher/app-state";
import {
  countNonTerminalHostRuns,
  countRunsByReleaseIds,
  getHostRun,
  getOrCreateHostRun,
  listDueRunningHostRuns,
  markHostRunStarted,
  updateHostRunReview
} from "../src/repositories/watcher/host-runs";
import { getOrCreateRelease } from "../src/repositories/watcher/releases";
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
      DELETE FROM watcher_deployments;
      DELETE FROM watcher_releases;
      DELETE FROM gcp_instance_operations;
      DELETE FROM gcp_accounts;
      DELETE FROM vps_hosts;
      DELETE FROM control_job_locks;
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
    expect(await listRecentOperations(env)).toMatchObject([
      { batchId: "batch-one", accountName: "Renamed", status: "succeeded" }
    ]);

    await deleteAccount(env, account.id);
    expect(await listRecentOperations(env)).toMatchObject([{ accountId: null }]);

    await runRetentionCleanup(env, new Date(Date.now() + 366 * 24 * 60 * 60 * 1000));
    expect(await listRecentOperations(env)).toEqual([]);
  });

  it("maps VPS booleans and dynamic updates", async () => {
    const repository = new VpsHostRepository(db);
    const host = await repository.create(
      {
        name: "Host One",
        address: "192.0.2.10",
        port: 22,
        username: "root",
        password: "secret"
      },
      "ciphertext",
      false
    );
    expect(host).toMatchObject({ enabled: false, password_ciphertext: "ciphertext" });

    const updated = await repository.patch(host!.id, { name: "Host Renamed", enabled: true });
    expect(updated).toMatchObject({ name: "Host Renamed", enabled: true });
    expect(await repository.listEnabled()).toEqual([updated]);
  });

  it("runs deployment conflicts, scheduling, and aggregations", async () => {
    const host = await new VpsHostRepository(db).create(
      {
        name: "Deploy Host",
        address: "192.0.2.20",
        port: 22,
        username: "root",
        password: "secret"
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
    expect(await countNonTerminalHostRuns(db)).toBe(1);
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
  });

  it("atomically acquires, rejects, replaces, and releases locks", async () => {
    expect(
      await acquireAppStateLock(
        db,
        "pipeline",
        "owner-one",
        "2026-07-16T00:10:00.000Z",
        "2026-07-16T00:00:00.000Z"
      )
    ).toBe(true);
    expect(
      await acquireAppStateLock(
        db,
        "pipeline",
        "owner-two",
        "2026-07-16T00:15:00.000Z",
        "2026-07-16T00:05:00.000Z"
      )
    ).toBe(false);
    expect(
      await acquireAppStateLock(
        db,
        "pipeline",
        "owner-two",
        "2026-07-16T00:20:00.000Z",
        "2026-07-16T00:10:00.000Z"
      )
    ).toBe(true);

    await releaseAppStateLock(db, "pipeline", "owner-one");
    await releaseAppStateLock(db, "pipeline", "owner-two");
    expect(
      await acquireAppStateLock(
        db,
        "pipeline",
        "owner-three",
        "2026-07-16T00:25:00.000Z",
        "2026-07-16T00:11:00.000Z"
      )
    ).toBe(true);
  });
});
