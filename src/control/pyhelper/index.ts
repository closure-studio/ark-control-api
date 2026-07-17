import { API_ERROR_CODES, type ApiErrorCode } from "../../constants/api/error-codes";
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
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number
  ) {
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
    throw new PyHelperControlError(
      API_ERROR_CODES.NOT_FOUND,
      "Unknown PyHelper asset.",
      404
    );
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
          ? API_ERROR_CODES.PYHELPER_INVALID_DOWNLOAD_REQUEST
          : API_ERROR_CODES.PYHELPER_DOWNLOAD_FAILED;
      throw new PyHelperControlError(code, error.message, error.status);
    }
    throw error;
  }
}
