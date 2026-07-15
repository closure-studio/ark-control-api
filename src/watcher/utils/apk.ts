export function extractApkFilename(finalUrl: string): string | null {
  try {
    const url = new URL(finalUrl);
    const filename = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
    return isSafeApkFilename(filename) ? filename : null;
  } catch {
    return null;
  }
}

export function isSafeApkFilename(filename: string): boolean {
  return /^arknights-hg-[A-Za-z0-9._-]+\.apk$/.test(filename);
}
