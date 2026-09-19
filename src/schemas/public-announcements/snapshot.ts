import * as v from "valibot";

export const OfficialUrlSchema = v.pipe(
  v.string(),
  v.regex(/^https:\/\/ak\.hypergryph\.com\/news\/\d+(?:\.html)?$/)
);
const TimestampSchema = v.pipe(v.string(), v.isoTimestamp());
export const WindowSchema = v.object({
  kind: v.picklist([
    "downtime",
    "brief_disconnect",
    "activity",
    "stage",
    "shop",
    "reward",
    "sale",
    "other"
  ]),
  sectionLabel: v.pipe(v.string(), v.maxLength(300)),
  startAt: v.nullable(TimestampSchema),
  endAt: v.nullable(TimestampSchema),
  timezone: v.literal("Asia/Shanghai"),
  rawTimeText: v.pipe(v.string(), v.maxLength(2000)),
  parseStatus: v.picklist(["parsed", "pending"])
});
export const WindowsSchema = v.pipe(v.array(WindowSchema), v.maxLength(100));
export const AnnouncementSchema = v.object({
  newsId: v.pipe(v.string(), v.regex(/^\d+$/)),
  sourceUrl: OfficialUrlSchema,
  title: v.pipe(v.string(), v.maxLength(300)),
  publishedAt: v.nullable(v.string()),
  fetchedAt: TimestampSchema,
  windows: WindowsSchema
});
export const ErrorCodeSchema = v.nullable(
  v.picklist(["source_failed", "rate_limited", "limit_reached", "parse_pending", "storage_failed"])
);
export const SnapshotSchema = v.object({
  schemaVersion: v.literal(1),
  generatedAt: TimestampSchema,
  lastAttemptAt: v.nullable(TimestampSchema),
  lastSuccessAt: v.nullable(TimestampSchema),
  status: v.picklist(["ready", "partial", "stale", "unavailable"]),
  errorCode: ErrorCodeSchema,
  events: v.pipe(v.array(AnnouncementSchema), v.maxLength(100))
});
export type Announcement = v.InferOutput<typeof AnnouncementSchema>;
export type AnnouncementWindow = v.InferOutput<typeof WindowSchema>;
export type Snapshot = v.InferOutput<typeof SnapshotSchema>;
export type AnnouncementErrorCode = v.InferOutput<typeof ErrorCodeSchema>;
