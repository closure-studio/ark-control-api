import { MONITORED_APK_URL } from "../constants/config";
import type { ApkMetadata } from "../types";
import { extractApkFilename } from "../utils/apk";

export async function fetchLatestApkMetadata(fetcher: typeof fetch = fetch): Promise<ApkMetadata> {
  const response = await fetcher(MONITORED_APK_URL, { redirect: "follow" });
  const finalUrl = response.url;

  if (!response.ok) {
    throw new Error(`bad status ${response.status} from monitored APK URL`);
  }

  const apkFilename = extractApkFilename(finalUrl);
  if (!apkFilename) {
    throw new Error(`invalid APK filename in final URL: ${finalUrl}`);
  }

  return { finalUrl, apkFilename };
}
