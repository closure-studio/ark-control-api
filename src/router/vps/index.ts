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
import type { Env } from "../../types/env";
import { jsonData, validationErrorHook } from "../../utils/http";

export function createVpsRouter() {
  const router = new Hono<{ Bindings: Env }>();

  router.get("/vps", async (c) => jsonData(c, await listVpsResources(c.env)));
  router.post(
    "/vps",
    sValidator("json", CreateVpsRequestSchema, validationErrorHook),
    async (c) => {
      const { watcherEnabled, ...input } = c.req.valid("json");
      let vps = await createManualVps(c.env, input);
      if (watcherEnabled === false) {
        vps = await updateVps(c.env, vps.id, { enabled: false });
      }
      return jsonData(c, { vps }, 201);
    }
  );
  router.get(
    "/vps/:id",
    sValidator("param", IdParamSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      return jsonData(c, { vps: await getVpsResource(c.env, id) });
    }
  );
  router.patch(
    "/vps/:id",
    sValidator("param", IdParamSchema, validationErrorHook),
    sValidator("json", PatchVpsRequestSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      const { watcherEnabled, password, ...fields } = c.req.valid("json");
      const patch = {
        ...fields,
        ...(password !== undefined && password !== "" ? { password } : {}),
        ...(watcherEnabled !== undefined ? { enabled: watcherEnabled } : {})
      };
      return jsonData(c, { vps: await updateVps(c.env, id, patch) });
    }
  );
  router.delete(
    "/vps/:id",
    sValidator("param", IdParamSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      return jsonData(c, await deleteVps(c.env, id));
    }
  );
  router.post(
    "/vps/:id/verify",
    sValidator("param", IdParamSchema, validationErrorHook),
    async (c) => {
      const { id } = c.req.valid("param");
      return jsonData(c, { result: await verifyVps(c.env, id) });
    }
  );

  return router;
}
