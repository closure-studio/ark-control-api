import { Hono } from "hono";
import { API_ERROR_CODES } from "../../constants/api/error-codes";
import {
  createManualVps,
  deleteVps,
  getVpsResource,
  listVpsResources,
  updateVps,
  validateCreateVpsHost,
  validatePatchVpsHost,
  verifyVps
} from "../../controller/vps";
import type { Env } from "../../types/env";
import { ControlApiError } from "../../errors/control-api";
import { jsonData, parseId, readBody } from "../../utils/http";

export function createVpsRouter() {
  const router = new Hono<{ Bindings: Env }>();

  router.get("/vps", async (c) => jsonData(c, await listVpsResources(c.env)));
  router.post("/vps", async (c) => {
    const body = await readBody(c);
    if (body.watcherEnabled !== undefined && typeof body.watcherEnabled !== "boolean") {
      throw new ControlApiError(
        API_ERROR_CODES.BAD_REQUEST,
        "watcherEnabled must be a boolean.",
        400
      );
    }
    const validation = validateCreateVpsHost({
      name: body.name,
      address: body.address,
      port: body.port,
      username: body.username,
      password: body.password
    });
    if (!validation.ok) {
      throw new ControlApiError(API_ERROR_CODES.BAD_REQUEST, validation.message, 400);
    }
    let vps = await createManualVps(c.env, validation.value);
    if (body.watcherEnabled === false) {
      vps = await updateVps(c.env, vps.id, { enabled: false });
    }
    return jsonData(c, { vps }, 201);
  });
  router.get("/vps/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError(API_ERROR_CODES.BAD_REQUEST, "Invalid VPS id.", 400);
    return jsonData(c, { vps: await getVpsResource(c.env, id) });
  });
  router.patch("/vps/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError(API_ERROR_CODES.BAD_REQUEST, "Invalid VPS id.", 400);
    const body = await readBody(c);
    const validation = validatePatchVpsHost({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.address !== undefined ? { address: body.address } : {}),
      ...(body.port !== undefined ? { port: body.port } : {}),
      ...(body.username !== undefined ? { username: body.username } : {}),
      ...(body.password !== undefined ? { password: body.password } : {}),
      ...(body.watcherEnabled !== undefined ? { enabled: body.watcherEnabled } : {})
    });
    if (!validation.ok) {
      throw new ControlApiError(API_ERROR_CODES.BAD_REQUEST, validation.message, 400);
    }
    return jsonData(c, { vps: await updateVps(c.env, id, validation.value) });
  });
  router.delete("/vps/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError(API_ERROR_CODES.BAD_REQUEST, "Invalid VPS id.", 400);
    return jsonData(c, await deleteVps(c.env, id));
  });
  router.post("/vps/:id/verify", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError(API_ERROR_CODES.BAD_REQUEST, "Invalid VPS id.", 400);
    return jsonData(c, { result: await verifyVps(c.env, id) });
  });

  return router;
}
