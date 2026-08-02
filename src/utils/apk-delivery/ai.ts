import * as v from "valibot";
import { AiReviewJsonSchema, type AiReviewParseResult } from "../../schemas/apk-delivery/ai";

function parseEmbeddedReview(rawResponse: string): v.InferOutput<typeof AiReviewJsonSchema> | null {
  const start = rawResponse.indexOf("{");
  if (start === -1) {
    return null;
  }

  for (
    let end = rawResponse.lastIndexOf("}");
    end > start;
    end = rawResponse.lastIndexOf("}", end - 1)
  ) {
    const result = v.safeParse(AiReviewJsonSchema, rawResponse.slice(start, end + 1));
    if (result.success) {
      return result.output;
    }
  }

  return null;
}

function protocolError(rawResponse: string, reason: string): AiReviewParseResult {
  return { status: "unknown", reason, rawResponse, protocolError: true };
}

export function parseAiReviewJson(rawResponse: string): AiReviewParseResult {
  const result = v.safeParse(AiReviewJsonSchema, rawResponse.trim());
  if (result.success) {
    return { ...result.output, rawResponse, protocolError: false };
  }

  const embedded = parseEmbeddedReview(rawResponse);
  if (embedded) {
    return { ...embedded, rawResponse, protocolError: false };
  }

  const issue = result.issues[0];
  if (issue.type === "parse_json") {
    return protocolError(rawResponse, "AI response was not valid JSON");
  }
  const field = issue.path?.[0]?.key;
  if (field === "status") {
    return protocolError(rawResponse, "AI response had an invalid status");
  }
  if (field === "reason") {
    return protocolError(rawResponse, "AI response had an invalid reason");
  }
  return protocolError(rawResponse, "AI response had unexpected fields");
}
