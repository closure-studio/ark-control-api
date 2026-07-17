import type { Env } from "../../env";
import {
  isPyHelperAssetName,
  PyHelperDownloadUrlError,
  verifyPyHelperDownloadRequest
} from "../../gcp/worker/services/pyhelper/download-url";
import {
  downloadLatestPyHelperAsset,
  PyHelperGitHubError
} from "../../gcp/worker/services/pyhelper/github";

export class PyHelperControlError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = "PyHelperControlError";
  }
}

export async function downloadPyHelperAsset(
  env: Env,
  assetName: string,
  requestUrl: string
): Promise<Response> {
  if (!isPyHelperAssetName(assetName)) {
    throw new PyHelperControlError("not_found", "Unknown PyHelper asset.", 404);
  }

  try {
    await verifyPyHelperDownloadRequest({
      assetName,
      requestUrl,
      token: env.GITHUB_PYHELPER_TOKEN
    });
    return downloadLatestPyHelperAsset({ assetName, token: env.GITHUB_PYHELPER_TOKEN });
  } catch (error) {
    if (error instanceof PyHelperDownloadUrlError || error instanceof PyHelperGitHubError) {
      const code =
        error instanceof PyHelperDownloadUrlError
          ? "invalid_download_request"
          : "pyhelper_download_failed";
      throw new PyHelperControlError(code, error.message, error.status);
    }
    throw error;
  }
}
