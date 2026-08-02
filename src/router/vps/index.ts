import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import {
  createManualVps,
  deleteVps,
  getVpsResource,
  listVpsResources,
  updateVps,
  verifyVps
} from "../../controller/vps";
import { IdParamSchema } from "../../schemas/params";
import { CreateVpsRequestSchema, PatchVpsRequestSchema } from "../../schemas/vps/hosts";
import type { Env } from "../../schemas/env";
import type { VpsResponse, VpsVerifyResponse } from "../../schemas/vps/responses";
import { jsonData, validationErrorHook } from "../../utils/http";

export function createVpsRouter() {
  const router = new Hono<{ Bindings: Env }>();

  router.get("/vps", async (c) => jsonData(c, await listVpsResources(c.env)));
  router.post(
    "/vps",
    sValidator("json", CreateVpsRequestSchema, validationErrorHook),
    async (c) => {
      const vps = await createManualVps(c.env, c.req.valid("json"));
      const response: VpsResponse = { vps };
      return jsonData(c, response, 201);
    }
  );
  router.get("/vps/:id", sValidator("param", IdParamSchema, validationErrorHook), async (c) => {
    const { id } = c.req.valid("param");
    const response: VpsResponse = { vps: await getVpsResource(c.env, id) };
    return jsonData(c, response);
  });
  router.patch(
    "/vps/:id",
    sValidator("param", IdParamSchema, validationErrorHook),
    sValidator("json", PatchVpsRequestSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      const response: VpsResponse = { vps: await updateVps(c.env, id, c.req.valid("json")) };
      return jsonData(c, response);
    }
  );
  router.delete("/vps/:id", sValidator("param", IdParamSchema, validationErrorHook), async (c) => {
    const { id } = c.req.valid("param");
    return jsonData(c, await deleteVps(c.env, id));
  });
  router.post(
    "/vps/:id/verify",
    sValidator("param", IdParamSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      const response: VpsVerifyResponse = { result: await verifyVps(c.env, id) };
      return jsonData(c, response);
    }
  );

  return router;
}
