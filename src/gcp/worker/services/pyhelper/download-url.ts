export const PYHELPER_ASSET_NAMES = ["Helper-arm64", "Helper-amd64"] as const;
export type PyHelperAssetName = (typeof PYHELPER_ASSET_NAMES)[number];

const PYHELPER_DOWNLOAD_TTL_SECONDS = 6 * 60 * 60;

export class PyHelperDownloadUrlError extends Error {
  readonly status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "PyHelperDownloadUrlError";
    this.status = status;
  }
}

export function isPyHelperAssetName(value: string): value is PyHelperAssetName {
  return PYHELPER_ASSET_NAMES.includes(value as PyHelperAssetName);
}

function requireToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new PyHelperDownloadUrlError("Missing Cloudflare secret: GITHUB_PYHELPER_TOKEN.", 500);
  }
  return trimmed;
}

function signaturePayload(assetName: PyHelperAssetName, expires: string): string {
  return `pyhelper:${assetName}:${expires}`;
}

async function hmacHex(token: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

export async function createPyHelperDownloadUrl(input: {
  assetName: PyHelperAssetName;
  baseUrl: string;
  token: string;
  now?: () => number;
  ttlSeconds?: number;
}): Promise<URL> {
  const token = requireToken(input.token);
  const now = input.now ?? (() => Math.floor(Date.now() / 1000));
  const expires = String(now() + (input.ttlSeconds ?? PYHELPER_DOWNLOAD_TTL_SECONDS));
  const url = new URL(`/api/pyhelper/assets/${encodeURIComponent(input.assetName)}`, input.baseUrl);
  url.searchParams.set("expires", expires);
  url.searchParams.set("signature", await hmacHex(token, signaturePayload(input.assetName, expires)));
  return url;
}

export async function verifyPyHelperDownloadRequest(input: {
  assetName: PyHelperAssetName;
  requestUrl: string;
  token: string;
  now?: () => number;
}): Promise<void> {
  const token = requireToken(input.token);
  const url = new URL(input.requestUrl);
  const expires = url.searchParams.get("expires");
  const signature = url.searchParams.get("signature");
  if (!expires || !signature) {
    throw new PyHelperDownloadUrlError("Missing PyHelper download signature.");
  }

  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt)) {
    throw new PyHelperDownloadUrlError("Invalid PyHelper download expiration.");
  }

  const now = input.now ?? (() => Math.floor(Date.now() / 1000));
  if (expiresAt <= now()) {
    throw new PyHelperDownloadUrlError("PyHelper download URL expired.");
  }

  const expected = await hmacHex(token, signaturePayload(input.assetName, expires));
  if (!constantTimeEqual(expected, signature)) {
    throw new PyHelperDownloadUrlError("Invalid PyHelper download signature.");
  }
}
