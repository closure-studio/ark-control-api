import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { WorkerHonoEnv } from "../model/schema/worker";
import {
  isPyHelperAssetName,
  PyHelperDownloadUrlError,
  verifyPyHelperDownloadRequest
} from "../services/pyhelper/download-url";
import { downloadLatestPyHelperAsset, PyHelperGitHubError } from "../services/pyhelper/github";
import { errorBody } from "../utils/http";

export async function getPyHelperAsset(c: Context<WorkerHonoEnv>) {
  const assetName = c.req.param("assetName") ?? "";
  if (!isPyHelperAssetName(assetName)) {
    return c.json(errorBody("Unknown PyHelper asset."), 404);
  }

  try {
    await verifyPyHelperDownloadRequest({
      assetName,
      requestUrl: c.req.url,
      token: c.env.GITHUB_PYHELPER_TOKEN
    });
    return downloadLatestPyHelperAsset({
      assetName,
      token: c.env.GITHUB_PYHELPER_TOKEN
    });
  } catch (error) {
    if (error instanceof PyHelperDownloadUrlError || error instanceof PyHelperGitHubError) {
      return c.json(errorBody(error.message), error.status as ContentfulStatusCode);
    }
    throw error;
  }
}
