import { Hono } from "hono";
import { API_ERRORS } from "../../shared/constants/errors";
import type { Env } from "../env";
import { jsonError, jsonResponse } from "../http/errors";
import { sanitizeAdminHost, VpsHostRepository } from "../repositories/vps-hosts";
import { executeHostCommand } from "../services/host-command-executor";
import { PasswordCrypto } from "../services/password-crypto";
import { validateCreateVpsHost, validatePatchVpsHost } from "../validation/vps-hosts";

export function createAdminVpsHostsRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", async (c) => {
    const rows = await new VpsHostRepository(c.env.DB).listAll();
    return jsonResponse({ hosts: rows.map(sanitizeAdminHost) });
  });

  app.post("/", async (c) => {
    const validation = validateCreateVpsHost(await readJson(c.req.raw));
    if (!validation.ok) return jsonError(API_ERRORS.badRequest, 400, validation.message);
    const passwordCiphertext = await new PasswordCrypto(c.env.VPS_PASSWORD_KEY).encrypt(validation.value.password);
    const created = await new VpsHostRepository(c.env.DB).create(validation.value, passwordCiphertext);
    if (!created) return jsonError(API_ERRORS.internalError, 500);
    return jsonResponse({ host: sanitizeAdminHost(created) }, 201);
  });

  app.get("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return jsonError(API_ERRORS.notFound, 404);
    const row = await new VpsHostRepository(c.env.DB).findById(id);
    return row ? jsonResponse({ host: sanitizeAdminHost(row) }) : jsonError(API_ERRORS.notFound, 404);
  });

  app.patch("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return jsonError(API_ERRORS.notFound, 404);
    const validation = validatePatchVpsHost(await readJson(c.req.raw));
    if (!validation.ok) return jsonError(API_ERRORS.badRequest, 400, validation.message);
    const passwordCiphertext =
      validation.value.password === undefined
        ? undefined
        : await new PasswordCrypto(c.env.VPS_PASSWORD_KEY).encrypt(validation.value.password);
    const updated = await new VpsHostRepository(c.env.DB).patch(id, validation.value, passwordCiphertext);
    return updated ? jsonResponse({ host: sanitizeAdminHost(updated) }) : jsonError(API_ERRORS.notFound, 404);
  });

  app.post("/:id/verify", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return jsonError(API_ERRORS.notFound, 404);

    try {
      const result = await executeHostCommand(c.env, { hostId: id });
      return jsonResponse({ result });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "host_not_found") {
        return jsonError(API_ERRORS.notFound, 404);
      }
      if (
        error instanceof Error &&
        ["host_id_invalid", "command_invalid", "timeout_invalid"].includes(error.message)
      ) {
        return jsonError(API_ERRORS.badRequest, 400, error.message);
      }
      throw error;
    }
  });

  app.delete("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return jsonError(API_ERRORS.notFound, 404);
    const repository = new VpsHostRepository(c.env.DB);
    const existing = await repository.findById(id);
    if (!existing) return jsonError(API_ERRORS.notFound, 404);
    await repository.delete(id);
    return new Response(null, { status: 204 });
  });

  return app;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseId(value: string): number | null {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}
