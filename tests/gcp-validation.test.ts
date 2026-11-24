import { generateKeyPairSync } from "node:crypto";
import { Miniflare } from "miniflare";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as v from "valibot";

import { api } from "../src";
import type { Env } from "../src/schemas/env";
import { RegisterGcpAccountRequestSchema } from "../src/schemas/gcp/accounts";
import { ProvisionGcpVpsRequestSchema } from "../src/schemas/gcp/compute";
import {
  buildDefaultInstanceInsertRequest,
  DEFAULT_VPS_BOOT_IMAGE
} from "../src/services/gcp/compute";
import { applyD1Migrations } from "./helpers/migrations";

describe("GCP account request validation", () => {
  it("normalizes the machine registration name from name, id, or project id", () => {
    expect(
      v.safeParse(RegisterGcpAccountRequestSchema, {
        id: "  machine-id  ",
        name: "  machine name  ",
        projectId: "  project-id  ",
        serviceAccountEmail: "service@example.com",
        workloadIdentityProvider: "provider",
        defaultZone: "us-central1-a"
      })
    ).toMatchObject({
      success: true,
      output: {
        name: "machine name",
        projectId: "project-id"
      }
    });

    expect(
      v.safeParse(RegisterGcpAccountRequestSchema, {
        id: "  machine-id  ",
        name: "   ",
        projectId: "project-id",
        serviceAccountEmail: "service@example.com",
        workloadIdentityProvider: "provider",
        defaultZone: "us-central1-a"
      })
    ).toMatchObject({ success: true, output: { name: "machine-id" } });

    expect(
      v.safeParse(RegisterGcpAccountRequestSchema, {
        name: "   ",
        projectId: "project-id",
        serviceAccountEmail: "service@example.com",
        workloadIdentityProvider: "provider",
        defaultZone: "us-central1-a"
      })
    ).toMatchObject({ success: true, output: { name: "project-id" } });
  });

  it("applies default VPS specs and validates custom provisioning options", () => {
    expect(v.safeParse(ProvisionGcpVpsRequestSchema, {})).toMatchObject({
      success: true,
      output: {
        cpuCount: 6,
        memoryGb: 16,
        provisioningModel: "SPOT",
        diskSizeGb: 100
      }
    });

    expect(
      v.safeParse(ProvisionGcpVpsRequestSchema, {
        cpuCount: 4,
        memoryGb: 16,
        provisioningModel: "STANDARD",
        diskSizeGb: 200
      })
    ).toMatchObject({
      success: true,
      output: {
        cpuCount: 4,
        memoryGb: 16,
        provisioningModel: "STANDARD",
        diskSizeGb: 200
      }
    });

    expect(
      v.safeParse(ProvisionGcpVpsRequestSchema, {
        cpuCount: 6,
        memoryGb: 8
      }).success
    ).toBe(false);

    expect(v.safeParse(ProvisionGcpVpsRequestSchema, { memoryGb: 1 })).toMatchObject({
      success: false,
      issues: [{ message: "Memory must be between 2 GB and 8 GB per vCPU for n4a-custom." }]
    });

    expect(
      v.safeParse(ProvisionGcpVpsRequestSchema, {
        cpuCount: 4,
        memoryGb: 64
      }).success
    ).toBe(false);

    expect(
      v.safeParse(ProvisionGcpVpsRequestSchema, {
        provisioningModel: "PREEMPTIBLE"
      }).success
    ).toBe(false);

    expect(
      v.safeParse(ProvisionGcpVpsRequestSchema, {
        diskSizeGb: 5
      }).success
    ).toBe(false);
  });

  it("builds GCP Compute insert payloads for Spot defaults and Standard custom specs", () => {
    const defaultPayload = buildDefaultInstanceInsertRequest({
      zone: "us-central1-c",
      instanceName: "ark-vps-test",
      spec: v.parse(ProvisionGcpVpsRequestSchema, {})
    });

    expect(defaultPayload.machineType).toBe("zones/us-central1-c/machineTypes/n4a-custom-6-16384");
    expect(defaultPayload.disks[0]?.initializeParams).toEqual({
      diskSizeGb: "100",
      sourceImage: DEFAULT_VPS_BOOT_IMAGE,
      diskType: "zones/us-central1-c/diskTypes/hyperdisk-balanced"
    });
    expect(defaultPayload.tags.items).toEqual(["http-server", "https-server"]);
    expect(defaultPayload.scheduling).toEqual({
      automaticRestart: false,
      onHostMaintenance: "TERMINATE",
      provisioningModel: "SPOT",
      instanceTerminationAction: "STOP",
      preemptionNoticeDuration: { seconds: "0" }
    });
    expect("labels" in defaultPayload).toBe(false);
    expect("serviceAccounts" in defaultPayload).toBe(false);

    const standardPayload = buildDefaultInstanceInsertRequest({
      zone: "us-central1-c",
      instanceName: "ark-vps-std",
      spec: {
        cpuCount: 8,
        memoryGb: 32,
        provisioningModel: "STANDARD",
        diskSizeGb: 200
      }
    });

    expect(standardPayload.machineType).toBe("zones/us-central1-c/machineTypes/n4a-custom-8-32768");
    expect(standardPayload.disks[0]?.initializeParams.diskSizeGb).toBe("200");
    expect(standardPayload.scheduling).toEqual({
      automaticRestart: true,
      onHostMaintenance: "MIGRATE",
      provisioningModel: "STANDARD"
    });
  });
});

describe("POST /api/accounts/:id/vps", () => {
  const authHeaders = {
    authorization: "Bearer secret",
    "content-type": "application/json"
  };
  let miniflare: Miniflare;
  let db: D1Database;
  let env: Env;
  let accountId: number;

  beforeAll(async () => {
    miniflare = new Miniflare({
      compatibilityDate: "2026-07-14",
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "gcp-provision-route-tests" }
    });
    db = await miniflare.getD1Database("DB");
    await applyD1Migrations(db);
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    env = {
      DB: db,
      ADMIN_TOKEN: "secret",
      VPS_PASSWORD_KEY: btoa("k".repeat(32)),
      GITHUB_PYHELPER_TOKEN: "gh-secret",
      OIDC_ISSUER: "https://issuer.example.com",
      OIDC_KEY_ID: "test-key",
      OIDC_SUBJECT: "ark-gcp-vps-manager",
      OIDC_PRIVATE_KEY_PEM: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    } as Env;

    const createAccount = await api.request(
      "https://control.example.com/api/accounts",
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          name: "Primary GCP",
          projectId: "ark-proj-1",
          serviceAccountEmail: "svc@ark-proj-1.iam.gserviceaccount.com",
          workloadIdentityProvider:
            "projects/1/locations/global/workloadIdentityPools/p/providers/w",
          defaultZone: "us-central1-c"
        })
      },
      env
    );
    const body = (await createAccount.json()) as { data: { account: { id: number } } };
    accountId = body.data.account.id;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it("forwards custom provisioning specs through router, controller, and Compute insert payload", async () => {
    let insertedBody: unknown;
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://sts.googleapis.com/")) {
        return Promise.resolve(Response.json({ access_token: "sts-token" }));
      }
      if (url.startsWith("https://iamcredentials.googleapis.com/")) {
        return Promise.resolve(Response.json({ accessToken: "gcp-token" }));
      }
      if (url.endsWith("/zones/us-central1-c/instances") && init?.method === "POST") {
        insertedBody = JSON.parse(String(init.body));
        return Promise.resolve(Response.json({ name: "op-create-1" }));
      }
      if (url.endsWith("/zones/us-central1-c/operations/op-create-1")) {
        return Promise.resolve(Response.json({ name: "op-create-1", status: "DONE" }));
      }
      if (url.includes("/zones/us-central1-c/instances/ark-vps-")) {
        return Promise.resolve(
          Response.json({
            name: url.split("/").pop(),
            status: "RUNNING",
            networkInterfaces: [{ accessConfigs: [{ natIP: "198.51.100.25" }] }]
          })
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await api.request(
      `https://control.example.com/api/accounts/${accountId}/vps`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          cpuCount: 8,
          memoryGb: 32,
          provisioningModel: "STANDARD",
          diskSizeGb: 200
        })
      },
      env
    );

    expect(response.status).toBe(201);
    expect(insertedBody).toMatchObject({
      machineType: "zones/us-central1-c/machineTypes/n4a-custom-8-32768",
      disks: [{ initializeParams: { diskSizeGb: "200" } }],
      scheduling: {
        automaticRestart: true,
        onHostMaintenance: "MIGRATE",
        provisioningModel: "STANDARD"
      }
    });
  });

  it("rejects invalid provisioning specs at the router with 400", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await api.request(
      `https://control.example.com/api/accounts/${accountId}/vps`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ cpuCount: 6, memoryGb: 8 })
      },
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "bad_request" }
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
