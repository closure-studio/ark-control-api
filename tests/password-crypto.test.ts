import { describe, expect, it } from "vitest";
import { PasswordCrypto } from "../src/services/vps/password-crypto";

describe("PasswordCrypto", () => {
  it("round-trips a password without storing plaintext", async () => {
    const crypto = new PasswordCrypto(btoa("k".repeat(32)));
    const encrypted = await crypto.encrypt("correct horse battery staple");

    expect(encrypted).not.toContain("correct horse battery staple");
    await expect(crypto.decrypt(encrypted)).resolves.toBe("correct horse battery staple");
  });

  it("requires a configured 256-bit key", async () => {
    await expect(new PasswordCrypto(undefined).encrypt("secret")).rejects.toThrow(
      "password_key_missing"
    );
    await expect(new PasswordCrypto(btoa("short")).encrypt("secret")).rejects.toThrow(
      "password_key_invalid"
    );
  });

  it("rejects malformed ciphertext envelopes", async () => {
    const crypto = new PasswordCrypto(btoa("k".repeat(32)));

    await expect(
      crypto.decrypt('{"v":1,"alg":"AES-GCM","iv":false,"ciphertext":"value"}')
    ).rejects.toThrow("password_ciphertext_invalid");
  });
});
