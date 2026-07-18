import { describe, expect, it } from "vitest";
import * as v from "valibot";

import { RegisterGcpAccountRequestSchema } from "../src/schemas/gcp/accounts";

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
});
