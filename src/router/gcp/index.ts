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
import { IdParamSchema } from "../../schemas/params";
import type { Env } from "../../schemas/env";
import type {
  GcpAccountDeleteResponse,
  GcpAccountResponse,
  GcpAccountsResponse
} from "../../schemas/gcp/responses";
import type { VpsProvisionResponse } from "../../schemas/vps/responses";
import { jsonData, jsonError, validationErrorHook } from "../../utils/http";

export function createGcpRouter() {
  const router = new Hono<{ Bindings: Env }>();

  router.post(
    "/public/accounts",
    sValidator("json", RegisterGcpAccountRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const result = await registerMachineGcpAccount(c.env, c.req.valid("json"));
        const response: GcpAccountResponse = { account: result.account };
        return jsonData(c, response, result.created ? 201 : 200);
      } catch (error) {
        const controlError = toGcpControlError(error);
        if (controlError) {
          return jsonError(c, controlError.code, controlError.message, controlError.status);
        }
        throw error;
      }
    }
  );

  router.get("/accounts", async (c) => {
    const response: GcpAccountsResponse = { accounts: await listGcpAccounts(c.env) };
    return jsonData(c, response);
  });
  router.post(
    "/accounts",
    sValidator("json", CreateGcpAccountRequestSchema, validationErrorHook),
    async (c) => {
      const account = await createGcpAccount(c.env, c.req.valid("json"));
      const response: GcpAccountResponse = { account };
      return jsonData(c, response, 201);
    }
  );
  router.patch(
    "/accounts/:id",
    sValidator("param", IdParamSchema, validationErrorHook),
    sValidator("json", UpdateGcpAccountRequestSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      const account = await updateGcpAccount(c.env, id, c.req.valid("json"));
      const response: GcpAccountResponse = { account };
      return jsonData(c, response);
    }
  );
  router.delete(
    "/accounts/:id",
    sValidator("param", IdParamSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      await deleteGcpAccount(c.env, id);
      const response: GcpAccountDeleteResponse = { deleted: true };
      return jsonData(c, response);
    }
  );
  router.post(
    "/accounts/:id/vps",
    sValidator("param", IdParamSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      const response: VpsProvisionResponse = await provisionGcpVps(
        c.env,
        id,
        new URL(c.req.url).origin
      );
      return jsonData(c, response, 201);
    }
  );

  return router;
}
