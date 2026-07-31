import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as v from "valibot";

import { api } from "../src";
import type { Env } from "../src/schemas/env";
import { VpsInventoryResponseSchema } from "../src/schemas/vps/hosts";
import { VpsResponseSchema } from "../src/schemas/vps/responses";
import { applyD1Migrations } from "./helpers/migrations";

const AUTHORIZATION_HEADERS = {
  authorization: "Bearer secret",
  "content-type": "application/json"
};

describe("VPS routes", () => {
  let miniflare: Miniflare;
  let db: D1Database;
  let env: Env;

  beforeAll(async () => {
    miniflare = new Miniflare({
      compatibilityDate: "2026-07-14",
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "vps-route-tests" }
    });
    db = await miniflare.getD1Database("DB");
    await applyD1Migrations(db);
    env = {
      DB: db,
      ADMIN_TOKEN: "secret",
      VPS_PASSWORD_KEY: btoa("k".repeat(32))
    } as Env;
  });

  beforeEach(async () => {
    await db.exec("DELETE FROM vps_hosts");
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it("defaults, exposes, and preserves VPS roles", async () => {
    const redroidResponse = await api.request(
      "https://control.example.com/api/vps",
      {
        method: "POST",
        headers: AUTHORIZATION_HEADERS,
        body: JSON.stringify({
          name: "Redroid Host",
          address: "192.0.2.60",
          username: "root",
          password: "secret"
        })
      },
      env
    );
    expect(redroidResponse.status).toBe(201);
    const redroid = v.parse(
      v.object({ data: VpsResponseSchema }),
      await redroidResponse.json()
    );
    expect(redroid.data.vps.role).toBe("redroid");

    const arkhostResponse = await api.request(
      "https://control.example.com/api/vps",
      {
        method: "POST",
        headers: AUTHORIZATION_HEADERS,
        body: JSON.stringify({
          name: "Arkhost",
          address: "192.0.2.61",
          username: "root",
          password: "secret",
          role: "arkhost",
          watcherEnabled: true
        })
      },
      env
    );
    expect(arkhostResponse.status).toBe(201);
    const arkhost = v.parse(
      v.object({ data: VpsResponseSchema }),
      await arkhostResponse.json()
    );
    expect(arkhost.data.vps).toMatchObject({ role: "arkhost", watcherEnabled: true });

    const patchResponse = await api.request(
      `https://control.example.com/api/vps/${arkhost.data.vps.id}`,
      {
        method: "PATCH",
        headers: AUTHORIZATION_HEADERS,
        body: JSON.stringify({ role: "redroid" })
      },
      env
    );
    expect(patchResponse.status).toBe(200);
    const patched = v.parse(
      v.object({ data: VpsResponseSchema }),
      await patchResponse.json()
    );
    expect(patched.data.vps.role).toBe("arkhost");

    const listResponse = await api.request(
      "https://control.example.com/api/vps",
      { headers: AUTHORIZATION_HEADERS },
      env
    );
    const inventory = v.parse(
      v.object({ data: VpsInventoryResponseSchema }),
      await listResponse.json()
    );
    expect(inventory.data.vps.map((host) => host.role)).toEqual(["redroid", "arkhost"]);
  });

  it("rejects unknown VPS roles", async () => {
    const response = await api.request(
      "https://control.example.com/api/vps",
      {
        method: "POST",
        headers: AUTHORIZATION_HEADERS,
        body: JSON.stringify({
          name: "Unknown Host",
          address: "192.0.2.62",
          username: "root",
          password: "secret",
          role: "other"
        })
      },
      env
    );

    expect(response.status).toBe(400);
  });
});
