import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import {
  downloadPyHelperAsset,
  PyHelperControlError
} from "../../controller/pyhelper";
import { PyHelperAssetParamSchema } from "../../schemas/pyhelper/download";
import type { Env } from "../../schemas/env";
import { jsonError, validationErrorHook } from "../../utils/http";

export function createPyHelperRouter() {
  const router = new Hono<{ Bindings: Env }>();
  router.get(
    "/pyhelper/assets/:assetName",
    sValidator("param", PyHelperAssetParamSchema, validationErrorHook),
    async (c) => {
      try {
        return await downloadPyHelperAsset(
          c.env,
          c.req.valid("param").assetName,
          c.req.url
        );
      } catch (error) {
        if (error instanceof PyHelperControlError) {
          return jsonError(c, error.code, error.message, error.status);
        }
        throw error;
      }
    }
  );
  return router;
}
