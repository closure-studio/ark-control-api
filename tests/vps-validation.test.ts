import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { CreateVpsHostSchema, PatchVpsHostSchema } from "../src/schemas/vps/hosts";

describe("VPS host validation", () => {
  it("accepts a hostname and applies the default SSH port", () => {
    expect(
      v.safeParse(CreateVpsHostSchema, {
        name: "primary",
        address: "vps.example.com",
        username: "root",
        password: "secret"
      })
    ).toMatchObject({
      success: true,
      output: {
        name: "primary",
        address: "vps.example.com",
        port: 22,
        username: "root",
        password: "secret"
      }
    });
  });

  it("validates enabled updates", () => {
    expect(v.safeParse(PatchVpsHostSchema, { enabled: false })).toMatchObject({
      success: true,
      output: { enabled: false }
    });
    expect(v.safeParse(PatchVpsHostSchema, { enabled: "no" }).success).toBe(false);
  });
});
