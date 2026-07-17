import { isAiReviewStatus } from "../../constants/watcher/status";
import type { AiReviewResult } from "../../types/watcher";

export interface AiReviewParseResult extends AiReviewResult {
  protocolError: boolean;
}

type AiReviewJsonObject = Record<string, unknown> & { status?: unknown; reason?: unknown };

function parseJsonObject(value: string): AiReviewJsonObject | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as AiReviewJsonObject;
  } catch {
    return null;
  }
}

function parseEmbeddedJsonObject(rawResponse: string): AiReviewJsonObject | null {
  const start = rawResponse.indexOf("{");
  if (start === -1) {
    return null;
  }

  for (let end = rawResponse.lastIndexOf("}"); end > start; end = rawResponse.lastIndexOf("}", end - 1)) {
    const parsed = parseJsonObject(rawResponse.slice(start, end + 1));
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function parseAiReviewJson(rawResponse: string): AiReviewParseResult {
  const parsed = parseJsonObject(rawResponse.trim()) ?? parseEmbeddedJsonObject(rawResponse);
  if (!parsed) {
    return { status: "unknown", reason: "AI response was not valid JSON", rawResponse, protocolError: true };
  }

  if (typeof parsed.status !== "string" || !isAiReviewStatus(parsed.status)) {
    return { status: "unknown", reason: "AI response had an invalid status", rawResponse, protocolError: true };
  }

  if (typeof parsed.reason !== "string" || parsed.reason.trim().length === 0) {
    return { status: "unknown", reason: "AI response had an invalid reason", rawResponse, protocolError: true };
  }

  if (Object.keys(parsed).some((key) => key !== "status" && key !== "reason")) {
    return { status: "unknown", reason: "AI response had unexpected fields", rawResponse, protocolError: true };
  }

  return {
    status: parsed.status,
    reason: parsed.reason.trim(),
    rawResponse,
    protocolError: false,
  };
}
