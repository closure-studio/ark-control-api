import { describe, expect, it, vi } from "vitest";
import * as v from "valibot";

import { api } from "../src/index";
import type { Env } from "../src/schemas/env";
import { SchedulerEnsureResponseSchema } from "../src/schemas/scheduler/responses";
import {
  ensureControlJobAlarms,
  refreshMaintenancePreActionAlarm
} from "../src/services/scheduler/client";

describe("control job alarm client", () => {
  it("checks every named instance even when one check fails", async () => {
    const fetch = vi.fn(async (request: Request) =>
      request.url.includes("maintenance-monitor")
        ? new Response(null, { status: 500 })
        : new Response(null, { status: 204 })
    );
    const requestedNames: string[] = [];
    const namespace = {
      getByName(name: string) {
        requestedNames.push(name);
        return {
          fetch: (request: Request) =>
            fetch(
              new Request(`${request.url}?job=${encodeURIComponent(name)}`, {
                method: request.method
              })
            )
        };
      }
    };

    await expect(ensureControlJobAlarms(namespace)).rejects.toThrow(
      "One or more control job alarms"
    );
    expect(requestedNames).toEqual([
      "apk-delivery",
      "maintenance-monitor",
      "maintenance-pre-action",
      "retention"
    ]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("refreshes only the dynamic maintenance instance", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const getByName = vi.fn(() => ({ fetch }));

    await refreshMaintenancePreActionAlarm({ getByName });

    expect(getByName).toHaveBeenCalledWith("maintenance-pre-action");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("exposes an authenticated, idempotent deployment bootstrap endpoint", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const getByName = vi.fn(() => ({ fetch }));
    const testEnv = {
      ADMIN_TOKEN: "admin-secret",
      CONTROL_JOB_ALARMS: { getByName }
    } as unknown as Env;

    await expect(
      api.request("/api/scheduler/ensure", { method: "POST" }, testEnv)
    ).resolves.toMatchObject({ status: 401 });

    const response = await api.request(
      "/api/scheduler/ensure",
      {
        method: "POST",
        headers: { Authorization: "Bearer admin-secret" }
      },
      testEnv
    );

    expect(response.status).toBe(200);
    const body = v.parse(v.object({ data: SchedulerEnsureResponseSchema }), await response.json());
    expect(body.data.ensuredJobs).toEqual([
      "apk-delivery",
      "maintenance-monitor",
      "maintenance-pre-action",
      "retention"
    ]);
    expect(getByName).toHaveBeenCalledTimes(4);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
