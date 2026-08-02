import * as v from "valibot";

const WorkersAiChoiceSchema = v.object({
  text: v.exactOptional(v.string()),
  finish_reason: v.exactOptional(v.string()),
  message: v.exactOptional(
    v.object({
      content: v.exactOptional(v.string())
    })
  )
});

export const WorkersAiProviderResponseSchema = v.object({
  response: v.exactOptional(v.string()),
  output_text: v.exactOptional(v.string()),
  choices: v.exactOptional(v.array(WorkersAiChoiceSchema))
});

export const WorkersAiTextResultSchema = v.variant("status", [
  v.object({
    status: v.literal("ok"),
    text: v.string()
  }),
  v.object({
    status: v.literal("error"),
    rawResponse: v.string(),
    reason: v.string()
  })
]);

export type WorkersAiTextResult = v.InferOutput<typeof WorkersAiTextResultSchema>;
