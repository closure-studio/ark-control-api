import * as v from "valibot";
import { AI_REVIEW_STATUSES } from "../../constants/watcher/status";

export const AiReviewStatusSchema = v.picklist(AI_REVIEW_STATUSES);
export const AiReviewReasonSchema = v.pipe(v.string(), v.trim(), v.nonEmpty());

export const AiReviewSchema = v.strictObject({
  status: AiReviewStatusSchema,
  reason: AiReviewReasonSchema
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
