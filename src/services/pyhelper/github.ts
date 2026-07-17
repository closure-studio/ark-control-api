import type { PyHelperAssetName } from "./download-url";

const GITHUB_API_VERSION = "2022-11-28";
const PYHELPER_OWNER = "closure-studio";
const PYHELPER_REPO = "PyHelper";

type GitHubReleaseAsset = {
  name?: string;
  url?: string;
  size?: number;
  content_type?: string;
};

type GitHubRelease = {
  tag_name?: string;
  assets?: GitHubReleaseAsset[];
};

export class PyHelperGitHubError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "PyHelperGitHubError";
    this.status = status;
  }
}

function requireToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new PyHelperGitHubError("Missing Cloudflare secret: GITHUB_PYHELPER_TOKEN.", 500);
  }
  return trimmed;
}

function apiHeaders(token: string, accept = "application/vnd.github+json"): Record<string, string> {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    "User-Agent": "ark-gcp-pyhelper-downloader",
    "X-GitHub-Api-Version": GITHUB_API_VERSION
  };
}

async function readGitHubJson<T>(fetcher: typeof fetch, url: string, token: string): Promise<T> {
  const response = await fetcher(url, { headers: apiHeaders(token) });
  if (!response.ok) {
    throw new PyHelperGitHubError(
      `GitHub release API failed ${response.status}: ${await response.text()}`
    );
  }
  return response.json() as Promise<T>;
}

export async function downloadLatestPyHelperAsset(input: {
  assetName: PyHelperAssetName;
  token: string;
  fetcher?: typeof fetch;
}): Promise<Response> {
  const token = requireToken(input.token);
  const fetcher = input.fetcher ?? fetch;
  const release = await readGitHubJson<GitHubRelease>(
    fetcher,
    `https://api.github.com/repos/${PYHELPER_OWNER}/${PYHELPER_REPO}/releases/latest`,
    token
  );
  const asset = (release.assets ?? []).find((candidate) => candidate.name === input.assetName);
  if (!asset?.url) {
    throw new PyHelperGitHubError(`PyHelper release asset not found: ${input.assetName}.`, 404);
  }

  let response = await fetcher(asset.url, {
    redirect: "manual",
    headers: apiHeaders(token, "application/octet-stream")
  });
  if (response.status === 302) {
    const location = response.headers.get("location");
    if (!location) {
      throw new PyHelperGitHubError("GitHub returned a PyHelper asset redirect without Location.");
    }
    response = await fetcher(location);
  }

  if (!response.ok || !response.body) {
    throw new PyHelperGitHubError(
      `PyHelper asset download failed ${response.status}: ${await response.text()}`
    );
  }

  const headers = new Headers();
  headers.set("content-type", asset.content_type ?? "application/octet-stream");
  headers.set("content-disposition", 'attachment; filename="Helper"');
  headers.set("cache-control", "no-store");
  const contentLength = response.headers.get("content-length") ?? String(asset.size ?? "");
  if (contentLength) {
    headers.set("content-length", contentLength);
  }

  return new Response(response.body, { status: 200, headers });
}
