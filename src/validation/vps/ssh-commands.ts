import type { ExecuteHostCommandRequest } from "../../types/vps/ssh-commands";

export const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
export const MAX_COMMAND_TIMEOUT_MS = 600_000;

export interface NormalizedExecuteHostCommandRequest {
  hostId: number;
  command?: string;
  timeoutMs: number;
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };

export function validateExecuteHostCommandRequest(input: unknown): ValidationResult<NormalizedExecuteHostCommandRequest> {
  if (!isRecord(input)) return { ok: false, message: "host_id_invalid" };

  const hostId = normalizeHostId(input.hostId);
  if (!hostId.ok) return hostId;

  const command = normalizeCommand(input.command);
  if (!command.ok) return command;

  const timeoutMs = normalizeTimeout(input.timeoutMs);
  if (!timeoutMs.ok) return timeoutMs;

  const value: NormalizedExecuteHostCommandRequest = {
    hostId: hostId.value,
    timeoutMs: timeoutMs.value
  };
  if (command.value !== undefined) value.command = command.value;
  return { ok: true, value };
}

function isRecord(value: unknown): value is Partial<ExecuteHostCommandRequest> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHostId(value: unknown): ValidationResult<number> {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return { ok: false, message: "host_id_invalid" };
  }
  return { ok: true, value };
}

function normalizeCommand(value: unknown): ValidationResult<string | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "string") return { ok: false, message: "command_invalid" };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: false, message: "command_invalid" };
  return { ok: true, value: trimmed };
}

function normalizeTimeout(value: unknown): ValidationResult<number> {
  if (value === undefined) return { ok: true, value: DEFAULT_COMMAND_TIMEOUT_MS };
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_COMMAND_TIMEOUT_MS) {
    return { ok: false, message: "timeout_invalid" };
  }
  return { ok: true, value };
}
