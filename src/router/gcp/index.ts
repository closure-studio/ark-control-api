import { Hono } from "hono";
import { API_ERROR_CODES } from "../../constants/api/error-codes";
import {
  createGcpAccount,
  deleteGcpAccount,
  listGcpAccounts,
  registerMachineGcpAccount,
  toGcpControlError,
  updateGcpAccount
} from "../../control/gcp";
import { provisionGcpVps } from "../../control/vps";
import type { Env } from "../../env";
import { ControlApiError } from "../../types/control/errors";
import { jsonData, jsonError, parseId, readBody } from "../../utils/http";

export function createGcpRouter() {
  const router = new Hono<{ Bindings: Env }>();

  router.post("/public/accounts", async (c) => {
    try {
      const result = await registerMachineGcpAccount(c.env, await readBody(c));
      return jsonData(c, { account: result.account }, result.created ? 201 : 200);
    } catch (error) {
      const controlError = toGcpControlError(error);
      if (controlError) {
        return jsonError(
          c,
          controlError.code,
          controlError.message,
          controlError.status
        );
      }
      throw error;
    }
  });

  router.get("/accounts", async (c) => jsonData(c, { accounts: await listGcpAccounts(c.env) }));
  router.post("/accounts", async (c) => {
    const account = await createGcpAccount(c.env, await readBody(c));
    return jsonData(c, { account }, 201);
  });
  router.patch("/accounts/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) {
      throw new ControlApiError(API_ERROR_CODES.BAD_REQUEST, "Invalid account id.", 400);
    }
    return jsonData(c, { account: await updateGcpAccount(c.env, id, await readBody(c)) });
  });
  router.delete("/accounts/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) {
      throw new ControlApiError(API_ERROR_CODES.BAD_REQUEST, "Invalid account id.", 400);
    }
    await deleteGcpAccount(c.env, id);
    return jsonData(c, { deleted: true });
  });
  router.post("/accounts/:id/vps", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) {
      throw new ControlApiError(API_ERROR_CODES.BAD_REQUEST, "Invalid account id.", 400);
    }
    const result = await provisionGcpVps(c.env, id, new URL(c.req.url).origin);
    return jsonData(c, result, 201);
  });

  return router;
}
