import { Hono } from "hono";
import {
  downloadPyHelperAsset,
  PyHelperControlError
} from "../../control/pyhelper";
import type { Env } from "../../env";
import { jsonError } from "../../utils/http";

export function createPyHelperRouter() {
  const router = new Hono<{ Bindings: Env }>();
  router.get("/pyhelper/assets/:assetName", async (c) => {
    try {
      return await downloadPyHelperAsset(
        c.env,
        c.req.param("assetName") ?? "",
        c.req.url
      );
    } catch (error) {
      if (error instanceof PyHelperControlError) {
        return jsonError(c, error.code, error.message, error.status);
      }
      throw error;
    }
  });
  return router;
}
