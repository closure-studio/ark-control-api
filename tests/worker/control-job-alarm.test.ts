import { env } from "cloudflare:workers";
import {
  applyD1Migrations,
  createExecutionContext,
  createScheduledController,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
  waitOnExecutionContext
} from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { ControlJobAlarm } from "../../src/services/scheduler/control-job-alarm";
import worker from "../../src/index";
import type { Env } from "../../src/schemas/env";

type WorkerTestBindings = Omit<Env, "CONTROL_JOB_ALARMS"> & {
  CONTROL_JOB_ALARMS: DurableObjectNamespace<ControlJobAlarm>;
  TEST_D1_MIGRATIONS: D1Migration[];
};

type D1Migration = {
  name: string;
  queries: string[];
};

const bindings = env as WorkerTestBindings;

beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_D1_MIGRATIONS);
});

describe("ControlJobAlarm", () => {
  it("initializes all fixed jobs through the scheduled watchdog entrypoint", async () => {
    const context = createExecutionContext();
    worker.scheduled(createScheduledController({ cron: "0 12 * * *" }), bindings, context);
    await waitOnExecutionContext(context);

    for (const job of ["apk-delivery", "maintenance-monitor", "retention"]) {
      expect(await alarmTime(bindings.CONTROL_JOB_ALARMS.getByName(job))).not.toBeNull();
    }
    expect(
      await alarmTime(bindings.CONTROL_JOB_ALARMS.getByName("maintenance-pre-action"))
    ).toBeNull();
  });

  it("keeps fixed jobs isolated and schedules exact UTC boundaries", async () => {
    const retention = bindings.CONTROL_JOB_ALARMS.getByName("retention");
    const monitor = bindings.CONTROL_JOB_ALARMS.getByName("maintenance-monitor");

    await expect(
      retention.fetch("https://control-job-alarm.internal/ensure", { method: "POST" })
    ).resolves.toMatchObject({ status: 204 });
    await expect(
      monitor.fetch("https://control-job-alarm.internal/ensure", { method: "POST" })
    ).resolves.toMatchObject({ status: 204 });

    const retentionAlarm = await alarmTime(retention);
    const monitorAlarm = await alarmTime(monitor);
    expect(retentionAlarm).not.toBeNull();
    expect(monitorAlarm).not.toBeNull();
    expect(new Date(retentionAlarm ?? 0).getUTCHours()).toBe(0);
    expect(new Date(retentionAlarm ?? 0).getUTCMinutes()).toBe(0);
    expect(new Date(monitorAlarm ?? 0).getUTCMinutes()).toBe(0);
  });

  it("removes an empty dynamic alarm and preserves fixed alarms across eviction", async () => {
    const preAction = bindings.CONTROL_JOB_ALARMS.getByName("maintenance-pre-action");
    const retention = bindings.CONTROL_JOB_ALARMS.getByName("retention");

    await preAction.fetch("https://control-job-alarm.internal/ensure", { method: "POST" });
    expect(await alarmTime(preAction)).toBeNull();

    await retention.fetch("https://control-job-alarm.internal/ensure", { method: "POST" });
    const beforeEviction = await alarmTime(retention);
    await evictDurableObject(retention);
    expect(await alarmTime(retention)).toBe(beforeEviction);
    await expect(runDurableObjectAlarm(retention)).resolves.toBe(true);
    expect(await alarmTime(retention)).not.toBeNull();
  });

  it("moves a late fixed alarm earlier without delaying an already earlier alarm", async () => {
    const retention = bindings.CONTROL_JOB_ALARMS.getByName("retention");
    const earlier = Date.now() + 60_000;
    await setAlarm(retention, earlier);
    await retention.fetch("https://control-job-alarm.internal/ensure", { method: "POST" });
    expect(await alarmTime(retention)).toBe(earlier);

    const late = Date.now() + 3 * 24 * 60 * 60 * 1000;
    await setAlarm(retention, late);
    await retention.fetch("https://control-job-alarm.internal/ensure", { method: "POST" });
    const repaired = await alarmTime(retention);
    expect(repaired).not.toBeNull();
    expect(repaired).toBeLessThan(late);
    expect(new Date(repaired ?? 0).getUTCHours()).toBe(0);
  });

  it("derives the dynamic alarm only from completed maintenance business state", async () => {
    const due = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const ignoredEarlier = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const maintenanceStart = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    await bindings.DB.prepare(
      `INSERT INTO arknights_maintenance_announcements (
        news_id, url, processing_state, first_seen_at, is_maintenance,
        maintenance_start_at, pre_action_at, pre_action_state
      ) VALUES
        ('processing', 'https://example.com/processing', 'processing', ?, 1, ?, ?, 'pending'),
        ('completed', 'https://example.com/completed', 'completed', ?, 1, ?, ?, 'pending')`
    )
      .bind(
        new Date().toISOString(),
        maintenanceStart,
        ignoredEarlier,
        new Date().toISOString(),
        maintenanceStart,
        due
      )
      .run();

    const preAction = bindings.CONTROL_JOB_ALARMS.getByName("maintenance-pre-action");
    await preAction.fetch("https://control-job-alarm.internal/ensure", { method: "POST" });

    expect(await alarmTime(preAction)).toBe(Date.parse(due));
  });

  it("uses platform retries first and installs a recovery alarm after the final retry", async () => {
    const monitor = bindings.CONTROL_JOB_ALARMS.getByName("maintenance-monitor");
    await deleteAlarm(monitor);

    try {
      await expect(
        runInDurableObject(monitor, async (instance) => {
          Object.defineProperty(instance, "runJob", {
            value: () => Promise.reject(new Error("simulated job failure"))
          });
          await instance.alarm({
            scheduledTime: Date.now(),
            retryCount: 0,
            isRetry: false
          });
        })
      ).rejects.toThrow("simulated job failure");
      expect(await alarmTime(monitor)).toBeNull();

      const beforeRecovery = Date.now();
      await runInDurableObject(monitor, async (instance) => {
        await instance.alarm({
          scheduledTime: Date.now(),
          retryCount: 6,
          isRetry: true
        });
      });

      const recoveryAlarm = await alarmTime(monitor);
      expect(recoveryAlarm).not.toBeNull();
      expect(recoveryAlarm).toBeGreaterThanOrEqual(beforeRecovery + 5 * 60 * 1000);
      expect(recoveryAlarm).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000 + 1_000);
    } finally {
      await deleteAlarm(monitor);
      await evictDurableObject(monitor);
    }
  });
});

async function alarmTime(stub: DurableObjectStub<ControlJobAlarm>): Promise<number | null> {
  return runInDurableObject(stub, async (_instance, state) => state.storage.getAlarm());
}

async function setAlarm(stub: DurableObjectStub<ControlJobAlarm>, at: number): Promise<void> {
  await runInDurableObject(stub, async (_instance, state) => state.storage.setAlarm(at));
}

async function deleteAlarm(stub: DurableObjectStub<ControlJobAlarm>): Promise<void> {
  await runInDurableObject(stub, async (_instance, state) => state.storage.deleteAlarm());
}
