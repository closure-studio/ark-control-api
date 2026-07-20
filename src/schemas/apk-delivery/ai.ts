import * as v from "valibot";
import { AI_REVIEW_STATUSES } from "../../constants/apk-delivery/status";

export const AiReviewStatusSchema = v.picklist(AI_REVIEW_STATUSES);
export const AiReviewReasonSchema = v.pipe(v.string(), v.trim(), v.nonEmpty());

const AiReviewEntries = {
  status: AiReviewStatusSchema,
  reason: AiReviewReasonSchema
};

const AiReviewResultEntries = {
  ...AiReviewEntries,
  rawResponse: v.string()
};

const AiReviewParseResultEntries = {
  ...AiReviewResultEntries,
  protocolError: v.boolean()
};

export const AiReviewSchema = v.strictObject(AiReviewEntries);

export const AiReviewResultSchema = v.object(AiReviewResultEntries);

export const AiReviewParseResultSchema = v.object(AiReviewParseResultEntries);

export const AiReviewWithModelSchema = v.object({
  ...AiReviewParseResultEntries,
  model: v.string()
});

export const AiReviewJsonSchema = v.pipe(v.string(), v.parseJson(), AiReviewSchema);

const AiChoiceSchema = v.object({
  text: v.exactOptional(v.string()),
  finish_reason: v.exactOptional(v.string()),
  message: v.exactOptional(
    v.object({
      content: v.exactOptional(v.string())
    })
  )
});

export const AiProviderResponseSchema = v.object({
  response: v.exactOptional(v.string()),
  output_text: v.exactOptional(v.string()),
  choices: v.exactOptional(v.array(AiChoiceSchema))
});

export type AiReviewStatus = v.InferOutput<typeof AiReviewStatusSchema>;
export type AiReviewResult = v.InferOutput<typeof AiReviewResultSchema>;
export type AiReviewParseResult = v.InferOutput<typeof AiReviewParseResultSchema>;
export type AiReviewWithModel = v.InferOutput<typeof AiReviewWithModelSchema>;
