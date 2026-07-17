import { VPS_HOST_FIELD_LIMITS } from "../../constants/vps/fields";
import type { CreateVpsHostRequest, PatchVpsHostRequest } from "../../types/vps/vps-hosts";

type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };

export function validateCreateVpsHost(input: unknown): ValidationResult<Required<CreateVpsHostRequest>> {
  if (!isRecord(input)) return { ok: false, message: "request body must be an object" };

  const name = requiredString(input.name, "name");
  if (!name.ok) return name;
  const address = requiredString(input.address, "address");
  if (!address.ok) return address;
  const username = requiredString(input.username, "username");
  if (!username.ok) return username;
  const password = requiredPassword(input.password);
  if (!password.ok) return password;
  const port = normalizePort(input.port ?? VPS_HOST_FIELD_LIMITS.defaultPort);
  if (!port.ok) return port;

  return {
    ok: true,
    value: {
      name: name.value,
      address: address.value,
      port: port.value,
      username: username.value,
      password: password.value
    }
  };
}

export function validatePatchVpsHost(input: unknown): ValidationResult<PatchVpsHostRequest> {
  if (!isRecord(input)) return { ok: false, message: "request body must be an object" };

  const value: PatchVpsHostRequest = {};
  if ("name" in input) {
    const name = requiredString(input.name, "name");
    if (!name.ok) return name;
    value.name = name.value;
  }
  if ("address" in input) {
    const address = requiredString(input.address, "address");
    if (!address.ok) return address;
    value.address = address.value;
  }
  if ("username" in input) {
    const username = requiredString(input.username, "username");
    if (!username.ok) return username;
    value.username = username.value;
  }
  if ("port" in input) {
    const port = normalizePort(input.port);
    if (!port.ok) return port;
    value.port = port.value;
  }
  if ("password" in input) {
    if (input.password === "") return { ok: true, value };
    const password = requiredPassword(input.password);
    if (!password.ok) return password;
    value.password = password.value;
  }
  if ("enabled" in input) {
    if (typeof input.enabled !== "boolean") return { ok: false, message: "enabled must be a boolean" };
    value.enabled = input.enabled;
  }
  return { ok: true, value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): ValidationResult<string> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, message: `${field} is required` };
  }
  return { ok: true, value: value.trim() };
}

function requiredPassword(value: unknown): ValidationResult<string> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, message: "password is required" };
  }
  return { ok: true, value };
}

function normalizePort(value: unknown): ValidationResult<number> {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < VPS_HOST_FIELD_LIMITS.minPort ||
    value > VPS_HOST_FIELD_LIMITS.maxPort
  ) {
    return { ok: false, message: "port must be an integer between 1 and 65535" };
  }
  return { ok: true, value };
}
