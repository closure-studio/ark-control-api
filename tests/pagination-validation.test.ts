import { describe, expect, it } from "vitest";
import * as v from "valibot";

import { PaginationQuerySchema } from "../src/schemas/pagination";
import { HostRunListQuerySchema } from "../src/schemas/apk-delivery/requests";

describe("pagination validation", () => {
  it("provides defaults in the validated output", () => {
    expect(v.safeParse(PaginationQuerySchema, {})).toMatchObject({
      success: true,
      output: { limit: 50, offset: 0 }
    });
  });

  it("converts and constrains query values", () => {
    expect(v.safeParse(PaginationQuerySchema, { limit: "150", offset: "25" })).toMatchObject({
      success: true,
      output: { limit: 100, offset: 25 }
    });
  });

  it("normalizes host-run list filters", () => {
    expect(v.safeParse(HostRunListQuerySchema, {})).toMatchObject({
      success: true,
      output: { limit: 50, offset: 0, state: "all" }
    });
    expect(
      v.safeParse(HostRunListQuerySchema, {
        limit: "1",
        offset: "2",
        state: "active"
      })
    ).toMatchObject({
      success: true,
      output: { limit: 1, offset: 2, state: "active" }
    });
  });

  it("rejects unsupported host-run list filters", () => {
    expect(v.safeParse(HostRunListQuerySchema, { state: "busy" }).success).toBe(false);
  });
});
