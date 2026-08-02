import * as v from "valibot";

import {
  WorkersAiProviderResponseSchema,
  WorkersAiTextResultSchema,
  type WorkersAiTextResult
} from "../../schemas/ai/provider";

function serializedResponse(response: unknown): string {
  if (typeof response === "string") return response;
  return JSON.stringify(response) ?? "";
}

function failure(response: unknown, reason: string): WorkersAiTextResult {
  return v.parse(WorkersAiTextResultSchema, {
    status: "error",
    rawResponse: serializedResponse(response),
    reason
  });
}

export function normalizeWorkersAiTextResponse(response: unknown): WorkersAiTextResult {
  if (typeof response === "string") {
    return response.trim().length > 0
      ? v.parse(WorkersAiTextResultSchema, { status: "ok", text: response })
      : failure(response, "AI response did not include content");
  }

  const result = v.safeParse(WorkersAiProviderResponseSchema, response);
  if (!result.success) {
    return failure(response, "AI response had an unsupported shape");
  }

  const directResponse = result.output.response ?? result.output.output_text;
  if (directResponse?.trim()) {
    return v.parse(WorkersAiTextResultSchema, {
      status: "ok",
      text: directResponse
    });
  }

  const [choice] = result.output.choices ?? [];
  if (choice?.finish_reason === "length") {
    return failure(response, "AI response was truncated");
  }

  const choiceText = choice?.text ?? choice?.message?.content;
  if (choiceText?.trim()) {
    return v.parse(WorkersAiTextResultSchema, { status: "ok", text: choiceText });
  }

  return failure(response, "AI response did not include content");
}
