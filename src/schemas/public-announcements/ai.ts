import * as v from "valibot";

export const AnnouncementSummaryTextSchema = v.pipe(
  v.string(),
  v.parseJson(),
  v.object({
    summaries: v.pipe(
      v.array(
        v.object({
          index: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(99)),
          summary: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(300))
        })
      ),
      v.maxLength(100)
    )
  })
);
