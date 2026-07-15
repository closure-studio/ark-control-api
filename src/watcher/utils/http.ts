export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function unauthorizedResponse(): Response {
  return jsonResponse({ error: "unauthorized" }, { status: 401 });
}

export function isAuthorized(request: Request, apiToken: string | undefined): boolean {
  if (typeof apiToken !== "string" || apiToken.length === 0) {
    return false;
  }

  const header = request.headers.get("authorization");
  return header === `Bearer ${apiToken}`;
}
