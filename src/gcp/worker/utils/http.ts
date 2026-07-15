import type { ErrorResponse } from "../../shared/api";

export function errorBody(error: string): ErrorResponse {
  return { error };
}

export async function readJsonObject(request: Request) {
  try {
    const value = await request.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}
