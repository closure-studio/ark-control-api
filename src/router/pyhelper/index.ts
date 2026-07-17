import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  downloadPyHelperAsset,
  PyHelperControlError
} from "../../control/pyhelper";
import type { Env } from "../../env";

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
        return c.json({ error: error.message }, error.status as ContentfulStatusCode);
      }
      throw error;
    }
  });
  return router;
}
