import { describe, expect, it } from "vitest";
import * as v from "valibot";

import { PaginationQuerySchema } from "../src/schemas/pagination";

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
});
