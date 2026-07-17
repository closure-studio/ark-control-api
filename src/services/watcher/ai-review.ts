import { AI_REVIEW_MAX_TOKENS, DEFAULT_AI_MODEL } from "../../constants/watcher/config";
import type { Env } from "../../types/env";
import { parseAiReviewJson, type AiReviewParseResult } from "../../utils/watcher/ai";

export interface AiReviewWithModel extends AiReviewParseResult {
  model: string;
}

function buildPrompt(logTail: string): string {
  return [
    "Review this Ark Watcher VPS deployment log.",
    "The Helper process has exited with code 0. Determine the final result of the complete deployment flow.",
    'Return only a JSON object with this exact schema: {"status":"success|running|failed|unknown","reason":"short explanation"}.',
    "Do not wrap the JSON in Markdown or add any extra text.",
    "Use status=success only when the log confirms the version was already current or the update completed, with no later unrecovered startup failure.",
    "Use status=running only when the log clearly ends before the deployment flow completes.",
    "Use status=failed when the log shows a final unrecovered update or startup failure.",
    "Use status=unknown when the log is ambiguous or insufficient.",
    "Evaluate events in chronological order. Ignore transient ERROR lines when a later line confirms recovery or a successful check.",
    "Log tail:",
    logTail,
  ].join("\n\n");
}

function getObjectStringProperty(value: unknown, property: string): string | null {
  if (!value || typeof value !== "object" || !(property in value)) {
    return null;
  }

  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === "string" ? propertyValue : null;
}

function getFirstChoice(response: Record<string, unknown>): Record<string, unknown> | null {
  const choices = response.choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return null;
  }
  return choices[0] as Record<string, unknown>;
}

function extractChoiceText(choice: Record<string, unknown>): string | null {
  const text = getObjectStringProperty(choice, "text");
  if (text !== null) {
    return text;
  }

  const message = choice.message;
  const content = getObjectStringProperty(message, "content");
  if (content !== null) {
    return content;
  }

  return null;
}

interface NormalizedAiResponse {
  rawResponse: string;
  protocolErrorReason: string | null;
}

function normalizeAiResponse(response: unknown): NormalizedAiResponse {
  if (typeof response === "string") {
    return { rawResponse: response, protocolErrorReason: null };
  }

  if (response && typeof response === "object") {
    const responseObject = response as Record<string, unknown>;
    const directResponse = getObjectStringProperty(responseObject, "response")
      ?? getObjectStringProperty(responseObject, "output_text");
    if (directResponse !== null) {
      return { rawResponse: directResponse, protocolErrorReason: null };
    }

    const choice = getFirstChoice(responseObject);
    if (choice && getObjectStringProperty(choice, "finish_reason") === "length") {
      return { rawResponse: JSON.stringify(response), protocolErrorReason: "AI response was truncated" };
    }

    if (choice) {
      const choiceText = extractChoiceText(choice);
      if (choiceText !== null && choiceText.trim().length > 0) {
        return { rawResponse: choiceText, protocolErrorReason: null };
      }
    }

    return { rawResponse: JSON.stringify(response), protocolErrorReason: "AI response did not include content" };
  }

  return { rawResponse: JSON.stringify(response), protocolErrorReason: "AI response had an unsupported shape" };
}

export async function reviewLogWithAi(env: Env, logTail: string): Promise<AiReviewWithModel> {
  const model = env.AI_MODEL || DEFAULT_AI_MODEL;
  const response = await env.AI.run(model, {
    chat_template_kwargs: {
      enable_thinking: false,
    },
    max_tokens: AI_REVIEW_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: buildPrompt(logTail),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ark_watcher_deployment_review",
        strict: true,
        schema: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["success", "running", "failed", "unknown"] },
            reason: { type: "string" },
          },
          required: ["status", "reason"],
          additionalProperties: false,
        },
      },
    },
    temperature: 0,
  });
  const normalized = normalizeAiResponse(response);

  if (normalized.protocolErrorReason) {
    return {
      model,
      status: "unknown",
      reason: normalized.protocolErrorReason,
      rawResponse: normalized.rawResponse,
      protocolError: true,
    };
  }

  return {
    model,
    ...parseAiReviewJson(normalized.rawResponse),
  };
}
