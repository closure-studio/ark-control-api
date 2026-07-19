import * as v from "valibot";

import { AiReviewStatusSchema } from "./ai";
import { HostRunStatusSchema } from "./status";

const ReleaseListItemSchema = v.object({
  id: v.number(),
  apkFilename: v.string(),
  finalUrl: v.string(),
  createdAt: v.string(),
  statusCounts: v.record(v.string(), v.number())
});

const ReleaseRunSchema = v.object({
  id: v.number(),
  releaseId: v.number(),
  hostId: v.nullable(v.number()),
  hostName: v.string(),
  hostIp: v.string(),
  status: HostRunStatusSchema,
  startedAt: v.nullable(v.string()),
  nextCheckAt: v.nullable(v.string()),
  deadlineAt: v.nullable(v.string()),
  lastCheckedAt: v.nullable(v.string()),
  lastAiStatus: v.nullable(AiReviewStatusSchema),
  lastAiReason: v.nullable(v.string()),
  errorMessage: v.nullable(v.string()),
  createdAt: v.string(),
  updatedAt: v.string()
});

export const ReleaseListResponseSchema = v.object({
  releases: v.array(ReleaseListItemSchema),
  pagination: v.object({
    limit: v.number(),
    offset: v.number(),
    count: v.number()
  })
});

export const ReleaseRunsResponseSchema = v.object({
  runs: v.array(ReleaseRunSchema)
});

export const RunListResponseSchema = v.object({
  runs: v.array(ReleaseRunSchema),
  pagination: v.object({
    limit: v.number(),
    offset: v.number(),
    count: v.number(),
    total: v.number()
  })
});

export const RunLogResponseSchema = v.object({
  lastLogTail: v.nullable(v.string()),
  lastCheckedAt: v.nullable(v.string()),
  updatedAt: v.string()
});

export type ReleaseListItem = v.InferOutput<typeof ReleaseListItemSchema>;
export type ReleaseRun = v.InferOutput<typeof ReleaseRunSchema>;
export type ReleaseListResponse = v.InferOutput<typeof ReleaseListResponseSchema>;
export type ReleaseRunsResponse = v.InferOutput<typeof ReleaseRunsResponseSchema>;
export type RunListResponse = v.InferOutput<typeof RunListResponseSchema>;
export type RunLogResponse = v.InferOutput<typeof RunLogResponseSchema>;
