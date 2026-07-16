import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { createHostCommandExecutor } from "../src/vps/worker/services/host-command-executor";

describe("managed host command execution", () => {
  it("loads and decrypts credentials before calling the stateless SSH executor", async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue({
        id: 7,
        name: "primary",
        address: "vps.example.com",
        port: 2222,
        username: "operator",
        password_ciphertext: "encrypted",
        enabled: 1,
        created_at: "2026-07-14T00:00:00.000Z",
        updated_at: "2026-07-14T00:00:00.000Z"
      })
    };
    const crypto = { decrypt: vi.fn().mockResolvedValue("plaintext-password") };
    const executeSshCommand = vi.fn().mockResolvedValue({
      connected: true,
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      signal: null,
      success: true,
      timedOut: false
    });

    const execute = createHostCommandExecutor({ repository, crypto, executeSshCommand });
    await execute({} as Env, { hostId: 7 });

    expect(crypto.decrypt).toHaveBeenCalledWith("encrypted");
    expect(executeSshCommand).toHaveBeenCalledWith({
      hostname: "vps.example.com",
      port: 2222,
      username: "operator",
      password: "plaintext-password",
      command: "echo ok",
      timeoutMs: 60_000
    });
  });
});
