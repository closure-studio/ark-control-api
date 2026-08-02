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

export type AiReviewStatus = v.InferOutput<typeof AiReviewStatusSchema>;
export type AiReviewResult = v.InferOutput<typeof AiReviewResultSchema>;
export type AiReviewParseResult = v.InferOutput<typeof AiReviewParseResultSchema>;
export type AiReviewWithModel = v.InferOutput<typeof AiReviewWithModelSchema>;
