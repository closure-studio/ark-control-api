export class GitHubApiError extends Error {
  constructor(readonly status: number) {
    super(`GitHub compatibility API returned HTTP ${status}`);
  }
}
