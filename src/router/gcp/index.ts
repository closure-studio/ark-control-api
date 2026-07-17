import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import {
  createGcpAccount,
  deleteGcpAccount,
  listGcpAccounts,
  registerMachineGcpAccount,
  toGcpControlError,
  updateGcpAccount
} from "../../controller/gcp";
import { provisionGcpVps } from "../../controller/vps";
import {
  CreateGcpAccountRequestSchema,
  RegisterGcpAccountRequestSchema,
  UpdateGcpAccountRequestSchema
} from "../../schemas/gcp/accounts";
import { IdParamSchema } from "../../schemas/http";
import type { Env } from "../../types/env";
import { jsonData, jsonError, validationErrorHook } from "../../utils/http";

export function createGcpRouter() {
  const router = new Hono<{ Bindings: Env }>();

  router.post(
    "/public/accounts",
    sValidator("json", RegisterGcpAccountRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const result = await registerMachineGcpAccount(c.env, c.req.valid("json"));
        return jsonData(c, { account: result.account }, result.created ? 201 : 200);
      } catch (error) {
        const controlError = toGcpControlError(error);
        if (controlError) {
          return jsonError(c, controlError.code, controlError.message, controlError.status);
        }
        throw error;
      }
    }
  );

  router.get("/accounts", async (c) =>
    jsonData(c, { accounts: await listGcpAccounts(c.env) })
  );
  router.post(
    "/accounts",
    sValidator("json", CreateGcpAccountRequestSchema, validationErrorHook),
    async (c) => {
      const account = await createGcpAccount(c.env, c.req.valid("json"));
      return jsonData(c, { account }, 201);
    }
  );
  router.patch(
    "/accounts/:id",
    sValidator("param", IdParamSchema, validationErrorHook),
    sValidator("json", UpdateGcpAccountRequestSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      const account = await updateGcpAccount(c.env, id, c.req.valid("json"));
      return jsonData(c, { account });
    }
  );
  router.delete(
    "/accounts/:id",
    sValidator("param", IdParamSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      await deleteGcpAccount(c.env, id);
      return jsonData(c, { deleted: true });
    }
  );
  router.post(
    "/accounts/:id/vps",
    sValidator("param", IdParamSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      const result = await provisionGcpVps(c.env, id, new URL(c.req.url).origin);
      return jsonData(c, result, 201);
    }
  );

  return router;
}
