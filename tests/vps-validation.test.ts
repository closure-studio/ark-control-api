import { describe, expect, it } from "vitest";
import { validateCreateVpsHost, validatePatchVpsHost } from "../src/validation/vps/vps-hosts";

describe("VPS host validation", () => {
  it("accepts a hostname and applies the default SSH port", () => {
    expect(
      validateCreateVpsHost({
        name: "primary",
        address: "vps.example.com",
        username: "root",
        password: "secret"
      })
    ).toEqual({
      ok: true,
      value: {
        name: "primary",
        address: "vps.example.com",
        port: 22,
        username: "root",
        password: "secret"
      }
    });
  });

  it("validates enabled updates", () => {
    expect(validatePatchVpsHost({ enabled: false })).toEqual({ ok: true, value: { enabled: false } });
    expect(validatePatchVpsHost({ enabled: "no" })).toEqual({ ok: false, message: "enabled must be a boolean" });
  });
});
