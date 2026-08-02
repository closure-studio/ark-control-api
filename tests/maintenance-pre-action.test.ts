import { Miniflare } from "miniflare";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as v from "valibot";

import { VpsHostRepository } from "../src/repositories/vps/vps-hosts";
import { EnvSchema, type Env } from "../src/schemas/env";
import { PassportLoginResponseSchema } from "../src/schemas/maintenance/pre-action";
import type { ExecuteSshCommandRequest } from "../src/schemas/vps/ssh-command";
import { runDueMaintenancePreActions } from "../src/services/maintenance/pre-action";
import { PasswordCrypto } from "../src/services/vps/password-crypto";
import { buildMaintenancePreActionSchedule } from "../src/utils/maintenance/pre-action-schedule";
import { applyD1Migrations } from "./helpers/migrations";

const PASSWORD_KEY = btoa("m".repeat(32));
const TEST_NOW = new Date("2026-08-01T00:00:00.000Z");

function createEnv(
  db: D1Database,
  executeCommand: (request: ExecuteSshCommandRequest) => Promise<unknown>
): Env {
  return v.parse(EnvSchema, {
    DB: db,
    AI: { run: vi.fn().mockResolvedValue({}) },
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

async function insertAnnouncement(
  db: D1Database,
  newsId: string,
  preActionState: "pending" | "processing" | "unschedulable",
  preActionAt: string | null,
  options: { title?: string; maintenanceStart?: string; maintenanceStartAt?: string } = {}
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO arknights_maintenance_announcements (
        news_id, url, processing_state, first_seen_at,
        processed_at, title, is_maintenance, maintenance_start,
        maintenance_start_at, pre_action_at, pre_action_state
      ) VALUES (?, ?, 'completed', ?, ?, ?, 1, ?, ?, ?, ?)`
    )
    .bind(
      newsId,
      `https://ak.hypergryph.com/news/${newsId}`,
      "2026-08-01T00:00:00.000Z",
      "2026-08-01T00:01:00.000Z",
      options.title ?? "版本更新停机维护公告",
      options.maintenanceStart ?? "2026年08月01日06:00",
      options.maintenanceStartAt ?? "2026-08-01T22:00:00.000Z",
      preActionAt,
      preActionState
    )
    .run();
}

function installSuccessfulHttpAdapter(): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("/api/v1/login")) {
      return new Response(
        JSON.stringify({
          code: 200,
          data: { available_slot: 1, token: "test-jwt" },
          message: "ok"
        }),
        { headers: { "content-type": "application/json" } }
      );
    }
    expect(url).toBe("https://api-tunnel.arknights.app/system/config");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-jwt");
    expect(JSON.parse(String(init?.body))).toEqual({ allowGameLogin: false });
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function successfulSshResult() {
  return {
    connected: true,
    stdout: "restarted",
    stderr: "",
    exitCode: 0,
    signal: null,
    success: true,
    timedOut: false
  };
}

describe("maintenance pre-action scheduling", () => {
  it("converts China Standard Time to UTC and subtracts two hours", () => {
    expect(buildMaintenancePreActionSchedule("2026年08月01日06:00")).toEqual({
      maintenanceStartAt: "2026-07-31T22:00:00.000Z",
      preActionAt: "2026-07-31T20:00:00.000Z"
    });
    expect(buildMaintenancePreActionSchedule("2026年02月30日06:00")).toBeNull();
    expect(buildMaintenancePreActionSchedule("8月1日06:00")).toBeNull();
  });

  it("validates the observed Passport response contract", () => {
    expect(
      v.safeParse(PassportLoginResponseSchema, {
        code: 200,
        data: { available_slot: 1, token: "token" },
        message: "ok"
      }).success
    ).toBe(true);
    expect(
      v.safeParse(PassportLoginResponseSchema, {
        code: 200,
        data: { available_slot: 1 },
        message: "ok"
      }).success
    ).toBe(false);
  });
});

describe("maintenance pre-action workflow", () => {
  let miniflare: Miniflare;
  let db: D1Database;

  beforeAll(async () => {
    miniflare = new Miniflare({
      compatibilityDate: "2026-07-14",
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "maintenance-pre-action-tests" }
    });
    db = await miniflare.getD1Database("DB");
    await applyD1Migrations(db);
  });

  beforeEach(async () => {
    await db.exec(`
      DELETE FROM arknights_maintenance_host_runs;
      DELETE FROM arknights_maintenance_announcements;
      DELETE FROM vps_hosts;
    `);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it("authenticates, disables login, and restarts every enabled ArkHost", async () => {
    await insertAnnouncement(db, "1459", "pending", "2026-07-31T20:00:00.000Z");
    const encryptedPassword = await new PasswordCrypto(PASSWORD_KEY).encrypt("password");
    const repository = new VpsHostRepository(db);
    const hosts: Array<[string, string]> = [
      ["ArkHost A", "192.0.2.10"],
      ["ArkHost B", "192.0.2.11"]
    ];
    for (const [name, address] of hosts) {
      await repository.create(
        { name, address, port: 22, username: "root", password: "password", role: "arkhost" },
        encryptedPassword
      );
    }
    await repository.create(
      {
        name: "Redroid",
        address: "192.0.2.12",
        port: 22,
        username: "root",
        password: "password",
        role: "redroid"
      },
      encryptedPassword
    );
    const fetcher = installSuccessfulHttpAdapter();
    const executeCommand = vi.fn(async (_request: ExecuteSshCommandRequest) =>
      successfulSshResult()
    );

    await runDueMaintenancePreActions(createEnv(db, executeCommand), TEST_NOW);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(executeCommand).toHaveBeenCalledTimes(2);
    for (const request of executeCommand.mock.calls.map((call) => call[0])) {
      expect(request.command).toBe("cd ~/ArkHost && ./arkhostctl.sh restart");
    }
    expect(
      await db
        .prepare(
          "SELECT pre_action_state, pre_action_failed_step FROM arknights_maintenance_announcements WHERE news_id = '1459'"
        )
        .first()
    ).toEqual({ pre_action_state: "completed", pre_action_failed_step: null });
    expect(
      (await db.prepare("SELECT status FROM arknights_maintenance_host_runs ORDER BY id").all())
        .results
    ).toEqual([{ status: "succeeded" }, { status: "succeeded" }]);
  });

  it("attempts all hosts and fails the task when one restart fails", async () => {
    await insertAnnouncement(db, "1460", "pending", "2026-07-31T20:00:00.000Z");
    const encryptedPassword = await new PasswordCrypto(PASSWORD_KEY).encrypt("password");
    const repository = new VpsHostRepository(db);
    const hosts: Array<[string, string]> = [
      ["ArkHost A", "192.0.2.20"],
      ["ArkHost B", "192.0.2.21"]
    ];
    for (const [name, address] of hosts) {
      await repository.create(
        { name, address, port: 22, username: "root", password: "password", role: "arkhost" },
        encryptedPassword
      );
    }
    installSuccessfulHttpAdapter();
    const executeCommand = vi.fn(async (request: ExecuteSshCommandRequest) =>
      request.hostname === "192.0.2.20"
        ? successfulSshResult()
        : { ...successfulSshResult(), success: false, exitCode: 1 }
    );

    await runDueMaintenancePreActions(createEnv(db, executeCommand), TEST_NOW);

    expect(executeCommand).toHaveBeenCalledTimes(2);
    expect(
      await db
        .prepare(
          "SELECT pre_action_state, pre_action_failed_step FROM arknights_maintenance_announcements WHERE news_id = '1460'"
        )
        .first()
    ).toEqual({ pre_action_state: "failed", pre_action_failed_step: "ssh" });
    expect(
      (await db.prepare("SELECT status FROM arknights_maintenance_host_runs ORDER BY id").all())
        .results
    ).toEqual([{ status: "succeeded" }, { status: "failed" }]);
  });

  it("checks inventory before changing external login configuration", async () => {
    await insertAnnouncement(db, "1461", "pending", "2026-07-31T20:00:00.000Z");
    const fetcher = installSuccessfulHttpAdapter();

    await runDueMaintenancePreActions(createEnv(db, vi.fn()), TEST_NOW);

    expect(fetcher).not.toHaveBeenCalled();
    expect(
      await db
        .prepare(
          "SELECT pre_action_state, pre_action_failed_step FROM arknights_maintenance_announcements WHERE news_id = '1461'"
        )
        .first()
    ).toEqual({ pre_action_state: "failed", pre_action_failed_step: "host_inventory" });
  });

  it("processes one due task and marks interrupted work explicitly", async () => {
    await insertAnnouncement(db, "1462", "pending", "2026-07-31T19:00:00.000Z");
    await insertAnnouncement(db, "1463", "pending", "2026-07-31T20:00:00.000Z");
    await insertAnnouncement(db, "1464", "processing", "2026-07-31T18:00:00.000Z");
    installSuccessfulHttpAdapter();

    await runDueMaintenancePreActions(createEnv(db, vi.fn()), TEST_NOW);

    expect(
      (
        await db
          .prepare(
            "SELECT news_id, pre_action_state, pre_action_failed_step FROM arknights_maintenance_announcements ORDER BY news_id"
          )
          .all()
      ).results
    ).toEqual([
      { news_id: "1462", pre_action_state: "failed", pre_action_failed_step: "host_inventory" },
      { news_id: "1463", pre_action_state: "pending", pre_action_failed_step: null },
      { news_id: "1464", pre_action_state: "failed", pre_action_failed_step: "interrupted" }
    ]);
  });

  it("marks a pre-action missed after maintenance has started", async () => {
    await insertAnnouncement(db, "1465", "pending", "2026-07-31T20:00:00.000Z", {
      maintenanceStartAt: "2026-07-31T23:00:00.000Z"
    });

    await runDueMaintenancePreActions(createEnv(db, vi.fn()), TEST_NOW);

    expect(
      (
        await db
          .prepare(
            "SELECT news_id, pre_action_state, pre_action_failed_step FROM arknights_maintenance_announcements"
          )
          .all()
      ).results
    ).toEqual([{ news_id: "1465", pre_action_state: "failed", pre_action_failed_step: "missed" }]);
  });
});
