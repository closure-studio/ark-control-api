import { DEFAULT_AI_MODEL } from "../../constants/ai";
import { AI_REVIEW_MAX_TOKENS } from "../../constants/apk-delivery/config";
import { AI_REVIEW_STATUSES } from "../../constants/apk-delivery/status";
import type { Env } from "../../schemas/env";
import type { AiReviewWithModel } from "../../schemas/apk-delivery/ai";
import { normalizeWorkersAiTextResponse } from "../ai/provider-response";
import { parseAiReviewJson } from "../../utils/apk-delivery/ai";

function buildPrompt(logTail: string): string {
  return [
    "Review this Ark APK delivery VPS deployment log.",
    "The Helper process has exited with code 0. Determine the final result of the complete deployment flow.",
    'Return only a JSON object with this exact schema: {"status":"success|running|failed|unknown","reason":"short explanation"}.',
    "Do not wrap the JSON in Markdown or add any extra text.",
    "Use status=success only when the log confirms the version was already current or the update completed, with no later unrecovered startup failure.",
    "Use status=running only when the log clearly ends before the deployment flow completes.",
    "Use status=failed when the log shows a final unrecovered update or startup failure.",
    "Use status=unknown when the log is ambiguous or insufficient.",
    "Evaluate events in chronological order. Ignore transient ERROR lines when a later line confirms recovery or a successful check.",
    "Log tail:",
    logTail
  ].join("\n\n");
}

export async function reviewLogWithAi(env: Env, logTail: string): Promise<AiReviewWithModel> {
  const model = env.AI_MODEL || DEFAULT_AI_MODEL;
  const response = await env.AI.run(model, {
    chat_template_kwargs: {
      enable_thinking: false
    },
    max_tokens: AI_REVIEW_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: buildPrompt(logTail)
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ark_apk_delivery_review",
        strict: true,
        schema: {
          type: "object",
          properties: {
            status: { type: "string", enum: [...AI_REVIEW_STATUSES] },
            reason: { type: "string" }
          },
          required: ["status", "reason"],
          additionalProperties: false
        }
      }
    },
    temperature: 0
  });
  const normalized = normalizeWorkersAiTextResponse(response);

  if (normalized.status === "error") {
    return {
      model,
      status: "unknown",
      reason: normalized.reason,
      rawResponse: normalized.rawResponse,
      protocolError: true
    };
  }

  return {
    model,
    ...parseAiReviewJson(normalized.text)
  };
}
