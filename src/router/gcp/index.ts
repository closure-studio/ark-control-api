import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
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
import { parseId, readBody } from "../../utils/http";

export function createGcpRouter() {
  const router = new Hono<{ Bindings: Env }>();

  router.post("/public/accounts", async (c) => {
    try {
      const result = await registerMachineGcpAccount(c.env, await readBody(c));
      return c.json({ account: result.account }, result.created ? 201 : 200);
    } catch (error) {
      const controlError = toGcpControlError(error);
      if (controlError) {
        return c.json(
          { error: controlError.message },
          controlError.status as ContentfulStatusCode
        );
      }
      throw error;
    }
  });

  router.get("/accounts", async (c) => c.json({ accounts: await listGcpAccounts(c.env) }));
  router.post("/accounts", async (c) => {
    const account = await createGcpAccount(c.env, await readBody(c));
    return c.json({ account }, 201);
  });
  router.patch("/accounts/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError("bad_request", "Invalid account id.", 400);
    return c.json({ account: await updateGcpAccount(c.env, id, await readBody(c)) });
  });
  router.delete("/accounts/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError("bad_request", "Invalid account id.", 400);
    await deleteGcpAccount(c.env, id);
    return c.json({ deleted: true });
  });
  router.post("/accounts/:id/vps", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) throw new ControlApiError("bad_request", "Invalid account id.", 400);
    const result = await provisionGcpVps(c.env, id, new URL(c.req.url).origin);
    return c.json(result, 201);
  });

  return router;
}
