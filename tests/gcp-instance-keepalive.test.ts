import { Miniflare } from "miniflare";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../src/schemas/env";
import type { ComputeInstance } from "../src/schemas/gcp/compute";
import { VpsHostRepository } from "../src/repositories/vps/vps-hosts";
import { fetchGoogleAccessToken } from "../src/services/gcp/auth";
import { runGcpInstanceKeepalive } from "../src/services/gcp/instance-keepalive";
import { nextUtcTenMinutes } from "../src/services/scheduler/time";
import { applyD1Migrations } from "./helpers/migrations";

vi.mock("../src/services/gcp/auth", () => ({ fetchGoogleAccessToken: vi.fn() }));

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
  let missingOperation = false;
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
      return Response.json(missingOperation ? {} : { name: "start-operation" });
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
    env = { DB: db } as Env;
    repository = new VpsHostRepository(db);
  });

  beforeEach(async () => {
    await db.exec("DELETE FROM vps_hosts; DELETE FROM gcp_accounts;");
    await account("project-a");
    projects.clear();
    startError = discoveryError = missingOperation = false;
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

  async function host(name: string, enabled = true) {
    const created = await repository.create(
      {
        name,
        address: "192.0.2.10",
        port: 22,
        username: name,
        password: "unused",
        role: "redroid"
      },
      "encrypted",
      enabled
    );
    if (!created) throw new Error("Host fixture failed");
    return created;
  }

  const run = () => runGcpInstanceKeepalive(env, { fetcher });
  const starts = () => fetcher.mock.calls.filter(([url]) => String(url).endsWith("/start"));

  it("submits a start without polling and syncs the IP only on a later running cycle", async () => {
    const managed = await host("ark-vps-mv0atlxm");
    projects.set("project-a", [
      instance(managed.name, "TERMINATED"),
      instance("other-purpose", "TERMINATED")
    ]);
    await run();
    expect(starts()).toHaveLength(1);
    expect(String(starts()[0]?.[0])).toContain(`/instances/${managed.name}/start`);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await repository.findById(managed.id)).toMatchObject({ address: managed.address });

    projects.set("project-a", [instance(managed.name, "RUNNING", "192.0.2.20")]);
    await run();
    expect(starts()).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(await repository.findById(managed.id)).toMatchObject({ address: "192.0.2.20" });
  });

  it("syncs a running VPS IP without starting it or changing other fields", async () => {
    const managed = await host("running");
    projects.set("project-a", [instance(managed.name, "RUNNING", "192.0.2.30")]);
    await run();
    expect(starts()).toHaveLength(0);
    expect(await repository.findById(managed.id)).toMatchObject({
      ...managed,
      address: "192.0.2.30",
      updated_at: expect.any(String)
    });
  });

  it.each(["PROVISIONING", "STAGING", "STOPPING", "SUSPENDED", "UNKNOWN"])(
    "leaves %s instances alone",
    async (status) => {
      const managed = await host("transition");
      projects.set("project-a", [instance(managed.name, status, "192.0.2.30")]);
      await run();
      expect(starts()).toHaveLength(0);
      expect(await repository.findById(managed.id)).toMatchObject({ address: managed.address });
    }
  );

  it("does not clear a running VPS address when GCP has no external IP", async () => {
    const managed = await host("no-ip");
    projects.set("project-a", [instance(managed.name, "RUNNING")]);
    await run();
    expect(await repository.findById(managed.id)).toMatchObject({ address: managed.address });
  });

  it("skips names that collide across projects", async () => {
    const managed = await host("duplicate");
    await account("project-b");
    projects.set("project-a", [instance(managed.name, "TERMINATED")]);
    projects.set("project-b", [instance(managed.name, "TERMINATED")]);
    await run();
    expect(starts()).toHaveLength(0);
    expect(await repository.findById(managed.id)).toMatchObject({ address: managed.address });
  });

  it("checks every page and zone before acting on a name", async () => {
    const managed = await host("duplicate-zone");
    fetcher
      .mockImplementationOnce(async () =>
        Response.json({
          items: { "zones/us-central1-a": { instances: [instance(managed.name, "TERMINATED")] } },
          nextPageToken: "page-2"
        })
      )
      .mockImplementationOnce(async () =>
        Response.json({
          items: {
            "zones/us-central1-b": { instances: [instance(managed.name, "RUNNING", "192.0.2.30")] }
          }
        })
      );
    await run();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("pageToken=page-2");
    expect(starts()).toHaveLength(0);
    expect(await repository.findById(managed.id)).toMatchObject({ address: managed.address });
  });

  it("ignores disabled accounts but does not use the business watcher switch as a keepalive switch", async () => {
    const managed = await host("watcher-disabled", false);
    await account("project-b", false);
    projects.set("project-a", [instance(managed.name, "TERMINATED")]);
    await run();
    expect(fetchGoogleAccessToken).toHaveBeenCalledOnce();
    expect(starts()).toHaveLength(1);
    expect(await repository.findById(managed.id)).toMatchObject({
      enabled: false,
      address: managed.address
    });
    projects.set("project-a", [instance(managed.name, "RUNNING", "192.0.2.20")]);
    await run();
    expect(await repository.findById(managed.id)).toMatchObject({
      enabled: false,
      address: "192.0.2.20"
    });
  });

  it("logs capacity failure without blocking another VPS and retries next cycle", async () => {
    const stopped = await host("stopped");
    const running = await host("running");
    projects.set("project-a", [
      instance(stopped.name, "TERMINATED"),
      instance(running.name, "RUNNING", "192.0.2.30")
    ]);
    startError = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await run();
    expect(log).toHaveBeenCalledWith(
      "GCP keepalive instance failed",
      expect.objectContaining({ error: "ZONE_RESOURCE_POOL_EXHAUSTED: No capacity" })
    );
    expect(await repository.findById(stopped.id)).toMatchObject({ address: stopped.address });
    expect(await repository.findById(running.id)).toMatchObject({ address: "192.0.2.30" });
    startError = false;
    await run();
    expect(starts()).toHaveLength(2);
    expect(await repository.findById(stopped.id)).toMatchObject({ address: stopped.address });
  });

  it("logs a missing operation name without treating the start as completed", async () => {
    const managed = await host("stopped");
    projects.set("project-a", [instance(managed.name, "TERMINATED")]);
    missingOperation = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await run();
    expect(log).toHaveBeenCalledWith(
      "GCP keepalive instance failed",
      expect.objectContaining({ error: "GCP start response did not include an operation name." })
    );
    expect(await repository.findById(managed.id)).toMatchObject({ address: managed.address });
  });

  it.each(["rename", "delete"])(
    "does not update or report an IP sync after a concurrent %s",
    async (change) => {
      const managed = await host("running");
      projects.set("project-a", [instance(managed.name, "RUNNING", "192.0.2.30")]);
      const findById = repository.findById.bind(repository);
      vi.spyOn(VpsHostRepository.prototype, "findById").mockImplementationOnce(async (id) => {
        const snapshot = await findById(id);
        if (change === "rename") {
          await db.prepare("UPDATE vps_hosts SET name = 'renamed' WHERE id = ?").bind(id).run();
        } else {
          await db.prepare("DELETE FROM vps_hosts WHERE id = ?").bind(id).run();
        }
        return snapshot;
      });
      const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

      await run();

      expect(log).not.toHaveBeenCalledWith("GCP keepalive updated VPS address", expect.anything());
      if (change === "rename") {
        expect(await repository.findById(managed.id)).toMatchObject({
          name: "renamed",
          address: managed.address
        });
      } else {
        expect(await repository.findById(managed.id)).toBeNull();
      }
    }
  );

  it("propagates database read failures instead of treating them as instance failures", async () => {
    const managed = await host("stopped");
    projects.set("project-a", [instance(managed.name, "TERMINATED")]);
    vi.spyOn(VpsHostRepository.prototype, "findById").mockRejectedValueOnce(
      new Error("D1 read failed")
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(run()).rejects.toThrow("D1 read failed");
    expect(starts()).toHaveLength(0);
    expect(log).not.toHaveBeenCalled();
  });

  it("propagates database update failures and allows a retry to sync the address", async () => {
    const managed = await host("running");
    projects.set("project-a", [instance(managed.name, "RUNNING", "192.0.2.30")]);
    vi.spyOn(VpsHostRepository.prototype, "updateAddressIfNameMatches").mockRejectedValueOnce(
      new Error("D1 update failed")
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(run()).rejects.toThrow("D1 update failed");
    expect(log).not.toHaveBeenCalled();
    expect(await repository.findById(managed.id)).toMatchObject({ address: managed.address });

    await run();
    expect(await repository.findById(managed.id)).toMatchObject({ address: "192.0.2.30" });
  });

  it("does not mutate instances when discovery is incomplete", async () => {
    await host("stopped");
    discoveryError = true;
    await expect(run()).rejects.toThrow("denied");
    expect(starts()).toHaveLength(0);
  });

  it("does not mutate a discovered match if a later account cannot be queried", async () => {
    const managed = await host("stopped");
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
  });

  it("does not call GCP when the VPS inventory is empty", async () => {
    await run();
    expect(fetchGoogleAccessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
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
