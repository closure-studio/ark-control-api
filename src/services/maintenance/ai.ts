import * as v from "valibot";

import { DEFAULT_AI_MODEL } from "../../constants/ai";
import { MAINTENANCE_AI_MAX_TOKENS } from "../../constants/maintenance/config";
import type { Env } from "../../schemas/env";
import {
  ClassificationResultSchema,
  type ClassificationResult,
  type NewsDetail
} from "../../schemas/maintenance/announcements";
import { MaintenanceAiJsonTextSchema, type MaintenanceAiJson } from "../../schemas/maintenance/ai";
import { normalizeWorkersAiTextResponse } from "../ai/provider-response";

export async function classifyMaintenanceWithAi(
  env: Env,
  news: NewsDetail
): Promise<ClassificationResult> {
  try {
    const model = env.AI_MODEL ?? DEFAULT_AI_MODEL;
    const response = await env.AI.run(model, {
      chat_template_kwargs: { enable_thinking: false },
      max_tokens: MAINTENANCE_AI_MAX_TOKENS,
      messages: [{ role: "user", content: buildPrompt(news) }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "arknights_maintenance_classification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              is_maintenance: { type: "boolean" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              maintenance_start: { type: ["string", "null"] },
              maintenance_end: { type: ["string", "null"] },
              reason: { type: "string" },
              summary: { type: "string" }
            },
            required: [
              "is_maintenance",
              "confidence",
              "maintenance_start",
              "maintenance_end",
              "reason",
              "summary"
            ],
            additionalProperties: false
          }
        }
      },
      temperature: 0
    });

    const normalized = normalizeWorkersAiTextResponse(response);
    if (normalized.status === "error") throw new Error(normalized.reason);

    const parsed = parseMaintenanceAiJson(normalized.text);
    return v.parse(ClassificationResultSchema, {
      status: parsed.is_maintenance ? "maintenance" : "not_maintenance",
      isMaintenance: parsed.is_maintenance,
      confidence: parsed.confidence,
      maintenanceStart: parsed.maintenance_start,
      maintenanceEnd: parsed.maintenance_end,
      reason: parsed.reason,
      summary: parsed.summary
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown AI error";
    console.warn("maintenance AI classification failed", { error: message });
    throw new Error(`AI classification failed: ${message}`);
  }
}

export function parseMaintenanceAiJson(rawResponse: string): MaintenanceAiJson {
  const direct = v.safeParse(MaintenanceAiJsonTextSchema, rawResponse);
  if (direct.success) return direct.output;

  const start = rawResponse.indexOf("{");
  if (start !== -1) {
    for (
      let end = rawResponse.lastIndexOf("}");
      end > start;
      end = rawResponse.lastIndexOf("}", end - 1)
    ) {
      const embedded = v.safeParse(MaintenanceAiJsonTextSchema, rawResponse.slice(start, end + 1));
      if (embedded.success) return embedded.output;
    }
  }

  throw new Error("AI response was not valid maintenance JSON");
}

function buildPrompt(news: NewsDetail): string {
  return [
    "你是明日方舟官网公告分类器。请判断公告是否为停机维护、版本更新停机维护或服务器维护公告。",
    "只返回 JSON，不要返回 Markdown，不要解释。",
    '{"is_maintenance":boolean,"confidence":number,"maintenance_start":string|null,"maintenance_end":string|null,"reason":string,"summary":string}',
    `标题：${news.title}`,
    `正文：${news.content.slice(0, 6000)}`
  ].join("\n");
}
