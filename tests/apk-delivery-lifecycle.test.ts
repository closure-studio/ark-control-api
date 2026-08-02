import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as v from "valibot";

import { VpsHostRepository } from "../src/repositories/vps/vps-hosts";
import { listHostRuns } from "../src/repositories/apk-delivery/host-runs";
import { EnvSchema, type Env } from "../src/schemas/env";
import type { ExecuteSshCommandRequest } from "../src/schemas/vps/ssh-command";
import { PasswordCrypto } from "../src/services/vps/password-crypto";
import {
  getNextApkDeliveryAlarmAt,
  runApkDeliveryCycle
} from "../src/services/apk-delivery/deployment-lifecycle";
import { HOST_PROCESS_META_MARKER } from "../src/utils/apk-delivery/shell";
import { applyD1Migrations } from "./helpers/migrations";

const PASSWORD_KEY = btoa("k".repeat(32));
const NOW = new Date("2026-07-20T12:00:00.000Z");

function createEnv(
  db: D1Database,
  executeCommand: (request: ExecuteSshCommandRequest) => Promise<unknown>
): Env {
  return v.parse(EnvSchema, {
    DB: db,
    AI: {
      run: vi.fn().mockResolvedValue({ response: '{"status":"success","reason":"done"}' })
    },
    ARK_SSH: { executeCommand },
    CONTROL_JOB_ALARMS: { getByName: vi.fn() },
    ADMIN_TOKEN: "admin",
    VPS_PASSWORD_KEY: PASSWORD_KEY,
    GITHUB_PYHELPER_TOKEN: "github",
    OIDC_ISSUER: "https://control.example.com",
    OIDC_KEY_ID: "key-id",
    OIDC_PRIVATE_KEY_PEM: "private-key",
    OIDC_SUBJECT: "subject",
    PUBLIC_TOKEN_BEARER_SECRET: "public-secret",
    ARKHOST_PASSPORT_EMAIL: "admin@example.com",
    ARKHOST_PASSPORT_PASSWORD: "passport-password"
  });
}

function apkResponse(): Response {
  const response = new Response("", { status: 200 });
  Object.defineProperty(response, "url", {
    value: "https://downloads.example.com/arknights-hg-1.0.0.apk"
  });
  return response;
}

describe("APK delivery lifecycle", () => {
  let miniflare: Miniflare;
  let db: D1Database;

  beforeAll(async () => {
    miniflare = new Miniflare({
      compatibilityDate: "2026-07-14",
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "apk-delivery-lifecycle-tests" }
    });
    db = await miniflare.getD1Database("DB");
    await applyD1Migrations(db);
  });

  beforeEach(async () => {
    await db.exec(`
      DELETE FROM arknights_apk_host_runs;
      DELETE FROM arknights_apk_releases;
      DELETE FROM vps_hosts;
    `);
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it("runs hosts independently and retries each disconnected SSH command three times", async () => {
    const encryptedPassword = await new PasswordCrypto(PASSWORD_KEY).encrypt("password");
    const repository = new VpsHostRepository(db);
    const hosts: Array<{ name: string; address: string; role: "redroid" | "arkhost" }> = [
      { name: "Host A", address: "192.0.2.10", role: "redroid" },
      { name: "Host B", address: "192.0.2.11", role: "redroid" },
      { name: "Host C", address: "192.0.2.12", role: "redroid" },
      { name: "Host D", address: "192.0.2.13", role: "arkhost" }
    ];
    for (const host of hosts) {
      await repository.create(
        {
          name: host.name,
          address: host.address,
          port: 22,
          username: "root",
          password: "password",
          role: host.role
        },
        encryptedPassword
      );
    }

    const sshRequests: ExecuteSshCommandRequest[] = [];
    const executeCommand = vi.fn(async (request: ExecuteSshCommandRequest) => {
      sshRequests.push(request);
      if (request.hostname === "192.0.2.11") {
        return {
          connected: false,
          stdout: "",
          stderr: "connection failed",
          exitCode: null,
          signal: null,
          success: false,
          timedOut: false
        };
      }
      return {
        connected: true,
        stdout: "started:123",
        stderr: "",
        exitCode: 0,
        signal: null,
        success: true,
        timedOut: false
      };
    });
    const env = createEnv(db, executeCommand);
    let apkFetchCount = 0;
    const fetcher: typeof fetch = async () => {
      apkFetchCount += 1;
      return apkResponse();
    };

    await runApkDeliveryCycle(env, {
      now: () => NOW,
      fetcher,
      logger: { error: vi.fn() }
    });

    const runs = await listHostRuns(db, undefined, 10, 0);
    expect(runs).toHaveLength(3);
    expect(Object.fromEntries(runs.map((run) => [run.host_name_snapshot, run.status]))).toEqual({
      "Host A": "running",
      "Host B": "failed",
      "Host C": "running"
    });
    expect(sshRequests.filter((request) => request.hostname === "192.0.2.10")).toHaveLength(1);
    expect(sshRequests.filter((request) => request.hostname === "192.0.2.11")).toHaveLength(3);
    expect(sshRequests.filter((request) => request.hostname === "192.0.2.12")).toHaveLength(1);
    expect(sshRequests.filter((request) => request.hostname === "192.0.2.13")).toHaveLength(0);
    await runApkDeliveryCycle(env, {
      now: () => new Date("2026-07-20T12:10:00.000Z"),
      fetcher,
      logger: { error: vi.fn() }
    });
    expect(apkFetchCount).toBe(1);
  });

  it("advances a running Host Run through log review to its terminal result", async () => {
    const encryptedPassword = await new PasswordCrypto(PASSWORD_KEY).encrypt("password");
    await new VpsHostRepository(db).create(
      {
        name: "Host A",
        address: "192.0.2.20",
        port: 22,
        username: "root",
        password: "password",
        role: "redroid"
      },
      encryptedPassword
    );

    const executeCommand = vi.fn(async (request: ExecuteSshCommandRequest) => ({
      connected: true,
      stdout: request.command.startsWith("tail -c")
        ? `deployment complete\n${HOST_PROCESS_META_MARKER}\nstate=exited\nexit_code=0`
        : "started:123",
      stderr: "",
      exitCode: 0,
      signal: null,
      success: true,
      timedOut: false
    }));
    const env = createEnv(db, executeCommand);
    const fetcher: typeof fetch = async () => apkResponse();
    const logger = { error: vi.fn() };

    await runApkDeliveryCycle(env, { now: () => NOW, fetcher, logger });
    await runApkDeliveryCycle(env, {
      now: () => new Date("2026-07-20T12:30:00.000Z"),
      fetcher,
      logger
    });

    expect(await listHostRuns(db, undefined, 10, 0)).toMatchObject([
      {
        host_name_snapshot: "Host A",
        status: "succeeded",
        last_log_tail: "deployment complete",
        last_ai_status: "success",
        last_ai_reason: "done"
      }
    ]);
    expect(executeCommand).toHaveBeenCalledTimes(2);
  });

  it("does not let pending recovery delay an earlier running deadline", async () => {
    await db.exec(`
      INSERT INTO vps_hosts (id, name, address, port, username, password_ciphertext) VALUES (1, 'Pending Host', '192.0.2.30', 22, 'root', 'ciphertext'), (2, 'Running Host', '192.0.2.31', 22, 'root', 'ciphertext');
      INSERT INTO arknights_apk_releases (id, apk_filename, final_url, detected_at) VALUES (1, 'release.apk', 'https://example.com/release.apk', '2026-07-20T11:00:00.000Z');
      INSERT INTO arknights_apk_host_runs (release_id, host_id, host_name_snapshot, host_address_snapshot, status, next_check_at, deadline_at, created_at, updated_at) VALUES (1, 1, 'Pending Host', '192.0.2.30', 'pending', NULL, NULL, '2026-07-20T11:00:00.000Z', '2026-07-20T11:00:00.000Z'), (1, 2, 'Running Host', '192.0.2.31', 'running', '2026-07-20T12:20:00.000Z', '2026-07-20T12:01:00.000Z', '2026-07-20T11:00:00.000Z', '2026-07-20T11:00:00.000Z');
    `);

    await expect(getNextApkDeliveryAlarmAt(db, NOW)).resolves.toEqual(
      new Date("2026-07-20T12:01:00.000Z")
    );
  });

  it("fills a missing Host Run for an already persisted latest Release", async () => {
    const encryptedPassword = await new PasswordCrypto(PASSWORD_KEY).encrypt("password");
    await new VpsHostRepository(db).create(
      {
        name: "Recovered Host",
        address: "192.0.2.40",
        port: 22,
        username: "root",
        password: "password",
        role: "redroid"
      },
      encryptedPassword
    );
    await db
      .prepare(
        `INSERT INTO arknights_apk_releases (apk_filename, final_url, detected_at)
         VALUES (?, ?, ?)`
      )
      .bind(
        "arknights-hg-1.0.0.apk",
        "https://downloads.example.com/arknights-hg-1.0.0.apk",
        NOW.toISOString()
      )
      .run();
    const executeCommand = vi.fn(async () => ({
      connected: true,
      stdout: "started:123",
      stderr: "",
      exitCode: 0,
      signal: null,
      success: true,
      timedOut: false
    }));

    await runApkDeliveryCycle(createEnv(db, executeCommand), {
      now: () => NOW,
      fetcher: async () => apkResponse(),
      logger: { error: vi.fn() }
    });

    expect(await listHostRuns(db, undefined, 10, 0)).toMatchObject([
      { host_name_snapshot: "Recovered Host", status: "running" }
    ]);
    expect(executeCommand).toHaveBeenCalledOnce();
  });
});
