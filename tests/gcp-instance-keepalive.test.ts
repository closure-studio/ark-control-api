import { Miniflare } from "miniflare";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../src/schemas/env";
import type { ComputeInstance } from "../src/schemas/gcp/compute";
import type { VpsRole } from "../src/schemas/vps/hosts";
import { VpsHostRepository } from "../src/repositories/vps/vps-hosts";
import { fetchGoogleAccessToken } from "../src/services/gcp/auth";
import { runGcpInstanceKeepalive } from "../src/services/gcp/instance-keepalive";
import {
  DEFAULT_VPS_SSH_PASSWORD,
  DEFAULT_VPS_SSH_USERNAME
} from "../src/services/gcp/startup-script";
import { nextUtcTenMinutes } from "../src/services/scheduler/time";
import { PasswordCrypto } from "../src/services/vps/password-crypto";
import { applyD1Migrations } from "./helpers/migrations";

vi.mock("../src/services/gcp/auth", () => ({ fetchGoogleAccessToken: vi.fn() }));

const PASSWORD_KEY = btoa("k".repeat(32));

function instance(name: string, status: string, address?: string): ComputeInstance {
  return {
    name,
    status,
    networkInterfaces: [{ accessConfigs: address ? [{ natIP: address }] : [] }]
  };
}

describe("GCP instance keepalive", () => {
  let miniflare: Miniflare;
  let db: D1Database;
  let env: Env;
  let repository: VpsHostRepository;
  const projects = new Map<string, ComputeInstance[]>();
  let startError = false;
  let discoveryError = false;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    );
    if (url.pathname.endsWith("/aggregated/instances")) {
      if (discoveryError) return Response.json({ error: { message: "denied" } }, { status: 403 });
      const project = url.pathname.split("/")[4] ?? "";
      return Response.json({
        items: { "zones/us-central1-a": { instances: projects.get(project) ?? [] } }
      });
    }
    if (url.pathname.endsWith("/start") && init?.method === "POST") {
      if (startError)
        return Response.json(
          { error: { message: "ZONE_RESOURCE_POOL_EXHAUSTED: No capacity" } },
          { status: 503 }
        );
      return Response.json({ name: "start-operation" });
    }
    throw new Error(`Unexpected GCP request: ${url.pathname}`);
  });

  beforeAll(async () => {
    miniflare = new Miniflare({
      compatibilityDate: "2026-07-14",
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "keepalive-tests" }
    });
    db = await miniflare.getD1Database("DB");
    await applyD1Migrations(db);
    env = { DB: db, VPS_PASSWORD_KEY: PASSWORD_KEY } as Env;
    repository = new VpsHostRepository(db);
  });

  beforeEach(async () => {
    await db.exec("DELETE FROM vps_hosts; DELETE FROM gcp_accounts;");
    await account("project-a");
    projects.clear();
    startError = discoveryError = false;
    fetcher.mockClear();
    vi.mocked(fetchGoogleAccessToken).mockReset().mockResolvedValue("access-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  async function account(project: string, enabled = true) {
    await db
      .prepare(
        `INSERT INTO gcp_accounts (name, project_id, service_account_email, workload_identity_provider, default_zone, enabled) VALUES (?, ?, 'sa@example.com', 'provider', 'us-central1-a', ?)`
      )
      .bind(project, project, enabled ? 1 : 0)
      .run();
  }

  async function host(
    name: string,
    options: { enabled?: boolean; role?: VpsRole; address?: string } = {}
  ) {
    const created = await repository.create(
      {
        name,
        address: options.address ?? "192.0.2.10",
        port: 22,
        username: DEFAULT_VPS_SSH_USERNAME,
        password: "unused",
        role: options.role ?? "redroid"
      },
      "encrypted",
      options.enabled ?? true
    );
    if (!created) throw new Error("Host fixture failed");
    return created;
  }

  const run = () => runGcpInstanceKeepalive(env, { fetcher });
  const starts = () => fetcher.mock.calls.filter(([url]) => String(url).endsWith("/start"));

  it("starts terminated ark-vps-* instances and syncs their IP on a later running cycle", async () => {
    const managed = await host("ark-vps-mv0atlxm");
    projects.set("project-a", [
      instance(managed.name, "TERMINATED"),
      instance("other-purpose", "TERMINATED")
    ]);
    await run();
    expect(starts()).toHaveLength(1);
    expect(String(starts()[0]?.[0])).toContain(`/instances/${managed.name}/start`);
    expect(await repository.findById(managed.id)).toMatchObject({ address: managed.address });

    projects.set("project-a", [instance(managed.name, "RUNNING", "192.0.2.20")]);
    await run();
    expect(starts()).toHaveLength(1);
    expect(await repository.findById(managed.id)).toMatchObject({ address: "192.0.2.20" });
  });

  it("registers new running ark-vps-* VMs with default credentials and ignores non-ark-vps-* VMs", async () => {
    projects.set("project-a", [
      instance("ark-vps-console1", "RUNNING", "192.0.2.40"),
      instance("other-vm", "RUNNING", "192.0.2.41")
    ]);
    await run();

    const rows = await repository.listAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "ark-vps-console1",
      address: "192.0.2.40",
      port: 22,
      username: DEFAULT_VPS_SSH_USERNAME,
      role: "redroid",
      enabled: true
    });
    const decrypted = await new PasswordCrypto(PASSWORD_KEY).decryptForTest(
      rows[0]!.password_ciphertext
    );
    expect(decrypted).toBe(DEFAULT_VPS_SSH_PASSWORD);
  });

  it("starts a terminated console ark-vps-* VM not yet in DB and registers it once running", async () => {
    projects.set("project-a", [instance("ark-vps-console2", "TERMINATED")]);
    await run();
    expect(starts()).toHaveLength(1);
    expect(await repository.listAll()).toHaveLength(0);

    projects.set("project-a", [instance("ark-vps-console2", "RUNNING", "192.0.2.50")]);
    await run();
    expect(await repository.listAll()).toMatchObject([
      { name: "ark-vps-console2", address: "192.0.2.50", role: "redroid" }
    ]);
  });

  it("deletes any redroid rows absent from GCP before inserting, while leaving arkhost rows untouched", async () => {
    const staleGcp = await host("ark-vps-deleted", { address: "192.0.2.60" });
    const staleOther = await host("old-redroid", { address: "192.0.2.61" });
    const arkhost = await host("arkhost-main", { role: "arkhost", address: "192.0.2.62" });
    projects.set("project-a", [instance("ark-vps-created", "RUNNING", "192.0.2.60")]);

    await run();

    expect(await repository.findById(staleGcp.id)).toBeNull();
    expect(await repository.findById(staleOther.id)).toBeNull();
    expect(await repository.findById(arkhost.id)).toMatchObject({
      name: "arkhost-main",
      role: "arkhost",
      address: "192.0.2.62"
    });
    expect(
      (await repository.listAll()).find((row) => row.name === "ark-vps-created")
    ).toMatchObject({
      address: "192.0.2.60",
      role: "redroid"
    });
  });

  it("updates running IP without changing enabled or other fields", async () => {
    const managed = await host("ark-vps-running", { enabled: false });
    projects.set("project-a", [instance(managed.name, "RUNNING", "192.0.2.30")]);
    await run();
    expect(starts()).toHaveLength(0);
    expect(await repository.findById(managed.id)).toMatchObject({
      ...managed,
      address: "192.0.2.30",
      enabled: false,
      updated_at: expect.any(String)
    });
  });

  it.each(["PROVISIONING", "STAGING", "STOPPING", "SUSPENDED", "UNKNOWN"])(
    "leaves %s ark-vps-* instances alone without deleting or registering them",
    async (status) => {
      const managed = await host("ark-vps-transition");
      projects.set("project-a", [
        instance(managed.name, status, "192.0.2.30"),
        instance("ark-vps-unregistered", status, "192.0.2.31")
      ]);
      await run();
      expect(starts()).toHaveLength(0);
      expect(await repository.findById(managed.id)).toMatchObject({ address: managed.address });
      expect(await repository.listAll()).toHaveLength(1);
    }
  );

  it("does not clear an existing address or register a new row when GCP has no external IP", async () => {
    const managed = await host("ark-vps-noip");
    projects.set("project-a", [
      instance(managed.name, "RUNNING"),
      instance("ark-vps-new-noip", "RUNNING")
    ]);
    await run();
    expect(await repository.findById(managed.id)).toMatchObject({ address: managed.address });
    expect(await repository.listAll()).toHaveLength(1);
  });

  it("ignores disabled accounts and is a no-op when no enabled accounts exist", async () => {
    await db.exec("DELETE FROM gcp_accounts;");
    await account("project-disabled", false);
    const managed = await host("ark-vps-kept");

    await run();

    expect(fetchGoogleAccessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await repository.findById(managed.id)).toMatchObject({ name: managed.name });
  });

  it("logs capacity failure without blocking other instances and retries next cycle", async () => {
    const stopped = await host("ark-vps-stopped", { address: "192.0.2.10" });
    const running = await host("ark-vps-running", { address: "192.0.2.11" });
    projects.set("project-a", [
      instance(stopped.name, "TERMINATED"),
      instance(running.name, "RUNNING", "192.0.2.30")
    ]);
    startError = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await run();
    expect(log).toHaveBeenCalledWith(
      "GCP keepalive start failed",
      expect.objectContaining({ error: "ZONE_RESOURCE_POOL_EXHAUSTED: No capacity" })
    );
    expect(await repository.findById(stopped.id)).toMatchObject({ address: stopped.address });
    expect(await repository.findById(running.id)).toMatchObject({ address: "192.0.2.30" });

    startError = false;
    await run();
    expect(starts()).toHaveLength(2);
  });

  it("does not mutate or delete hosts when discovery fails for any enabled account", async () => {
    const managed = await host("ark-vps-stopped", { address: "192.0.2.10" });
    const stale = await host("ark-vps-stale", { address: "192.0.2.11" });
    await account("project-b");
    fetcher.mockImplementationOnce(async () =>
      Response.json({
        items: { "zones/us-central1-a": { instances: [instance(managed.name, "TERMINATED")] } }
      })
    );
    discoveryError = true;

    await expect(run()).rejects.toThrow("denied");
    expect(starts()).toHaveLength(0);
    expect(await repository.findById(managed.id)).toMatchObject({ address: managed.address });
    expect(await repository.findById(stale.id)).toMatchObject({ address: stale.address });
  });

  it("propagates database write failures so alarm retry can recover", async () => {
    const managed = await host("ark-vps-running");
    projects.set("project-a", [instance(managed.name, "RUNNING", "192.0.2.30")]);
    vi.spyOn(VpsHostRepository.prototype, "patch").mockRejectedValueOnce(
      new Error("D1 update failed")
    );

    await expect(run()).rejects.toThrow("D1 update failed");
    expect(await repository.findById(managed.id)).toMatchObject({ address: managed.address });

    await run();
    expect(await repository.findById(managed.id)).toMatchObject({ address: "192.0.2.30" });
  });

  it("uses exact ten-minute UTC boundaries", () => {
    expect(nextUtcTenMinutes(new Date("2026-08-01T12:03:59Z")).toISOString()).toBe(
      "2026-08-01T12:10:00.000Z"
    );
    expect(nextUtcTenMinutes(new Date("2026-08-01T12:10:00Z")).toISOString()).toBe(
      "2026-08-01T12:20:00.000Z"
    );
    expect(nextUtcTenMinutes(new Date("2026-08-01T23:59:59Z")).toISOString()).toBe(
      "2026-08-02T00:00:00.000Z"
    );
  });
});
