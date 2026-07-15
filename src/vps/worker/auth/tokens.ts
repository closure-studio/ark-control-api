export function isBearerAuthorized(request: Request, expectedToken: string | undefined): boolean {
  if (!expectedToken) {
    return false;
  }

  return request.headers.get("Authorization") === `Bearer ${expectedToken}`;
}
