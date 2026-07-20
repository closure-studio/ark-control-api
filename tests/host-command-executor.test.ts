import { describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import { EnvSchema } from "../src/schemas/env";
import { createHostCommandExecutor } from "../src/services/vps/host-command-executor";

const TEST_ENV = v.parse(EnvSchema, {
  DB: { prepare: () => undefined },
  AI: { run: async () => undefined },
  ARK_SSH: { executeCommand: async () => undefined },
  ADMIN_TOKEN: "admin",
  VPS_PASSWORD_KEY: "password-key",
  GITHUB_PYHELPER_TOKEN: "github",
  TASK_SERVER_BASE_URL: "https://tasks.example.com",
  TASK_SERVER_AUTHORIZATION: "Bearer tasks",
  OIDC_ISSUER: "https://control.example.com",
  OIDC_KEY_ID: "key-id",
  OIDC_PRIVATE_KEY_PEM: "private-key",
  OIDC_SUBJECT: "subject",
  PUBLIC_TOKEN_BEARER_SECRET: "public-secret"
});

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
        enabled: true,
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
    await execute(TEST_ENV, { hostId: 7 });

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

  it("retries disconnected SSH commands up to three total attempts", async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue({
        id: 7,
        name: "primary",
        address: "vps.example.com",
        port: 22,
        username: "root",
        password_ciphertext: "encrypted",
        enabled: true,
        created_at: "2026-07-14T00:00:00.000Z",
        updated_at: "2026-07-14T00:00:00.000Z"
      })
    };
    const crypto = { decrypt: vi.fn().mockResolvedValue("plaintext-password") };
    const disconnected = {
      connected: false,
      stdout: "",
      stderr: "connection failed",
      exitCode: null,
      signal: null,
      success: false,
      timedOut: false
    };
    const connected = {
      connected: true,
      stdout: "done",
      stderr: "",
      exitCode: 0,
      signal: null,
      success: true,
      timedOut: false
    };
    const executeSshCommand = vi
      .fn()
      .mockResolvedValueOnce(disconnected)
      .mockResolvedValueOnce(disconnected)
      .mockResolvedValueOnce(connected);
    const execute = createHostCommandExecutor({ repository, crypto, executeSshCommand });

    await expect(execute(TEST_ENV, { hostId: 7, command: "custom command" })).resolves.toEqual(
      connected
    );
    expect(executeSshCommand).toHaveBeenCalledTimes(3);
    expect(repository.findById).toHaveBeenCalledOnce();
    expect(crypto.decrypt).toHaveBeenCalledOnce();
  });

  it("returns the third disconnection without retrying timeouts", async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue({
        id: 7,
        name: "primary",
        address: "vps.example.com",
        port: 22,
        username: "root",
        password_ciphertext: "encrypted",
        enabled: true,
        created_at: "2026-07-14T00:00:00.000Z",
        updated_at: "2026-07-14T00:00:00.000Z"
      })
    };
    const disconnected = {
      connected: false,
      stdout: "",
      stderr: "connection failed",
      exitCode: null,
      signal: null,
      success: false,
      timedOut: false
    };
    const executeSshCommand = vi.fn().mockResolvedValue(disconnected);
    const execute = createHostCommandExecutor({
      repository,
      crypto: { decrypt: vi.fn().mockResolvedValue("plaintext-password") },
      executeSshCommand
    });

    await expect(execute(TEST_ENV, { hostId: 7 })).resolves.toEqual(disconnected);
    expect(executeSshCommand).toHaveBeenCalledTimes(3);

    const timedOut = { ...disconnected, connected: true, timedOut: true };
    executeSshCommand.mockClear();
    executeSshCommand.mockResolvedValue(timedOut);
    await expect(execute(TEST_ENV, { hostId: 7 })).resolves.toEqual(timedOut);
    expect(executeSshCommand).toHaveBeenCalledOnce();
  });

  it("rejects malformed SSH Worker responses", async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue({
        id: 7,
        name: "primary",
        address: "vps.example.com",
        port: 22,
        username: "root",
        password_ciphertext: "encrypted",
        enabled: true,
        created_at: "2026-07-14T00:00:00.000Z",
        updated_at: "2026-07-14T00:00:00.000Z"
      })
    };
    const execute = createHostCommandExecutor({
      repository,
      crypto: { decrypt: vi.fn().mockResolvedValue("plaintext-password") },
      executeSshCommand: vi.fn().mockResolvedValue({ connected: "yes" })
    });

    await expect(execute(TEST_ENV, { hostId: 7 })).rejects.toThrow(
      "ssh_response_invalid"
    );
  });
});
