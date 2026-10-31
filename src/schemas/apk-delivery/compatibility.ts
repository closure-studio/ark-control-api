import * as v from "valibot";

const CommitSchema = v.pipe(v.string(), v.regex(/^[0-9a-f]{40}$/));
const RunIdSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(Number.MAX_SAFE_INTEGER)
);

export const CompatibilityStatusSchema = v.picklist([
  "queued",
  "running",
  "passed",
  "failed",
  "cancelled",
  "timed_out"
]);

export const CompatibilityRequestSchema = v.object({
  apk_filename: v.string(),
  apk_url: v.pipe(v.string(), v.url()),
  hook_sha: CommitSchema
});

export const GitHubCommitSchema = v.object({ sha: CommitSchema });
export const GitHubDispatchSchema = v.object({
  workflow_run_id: RunIdSchema,
  run_url: v.pipe(v.string(), v.url()),
  html_url: v.pipe(v.string(), v.url())
});
export const GitHubRunSchema = v.object({
  id: RunIdSchema,
  run_attempt: v.pipe(v.number(), v.integer(), v.minValue(1)),
  display_title: v.string(),
  path: v.string(),
  event: v.literal("workflow_dispatch"),
  head_branch: v.string(),
  html_url: v.pipe(v.string(), v.url()),
  status: v.picklist(["queued", "in_progress", "completed", "waiting", "requested", "pending"]),
  conclusion: v.nullable(v.string())
});
export const GitHubRunListSchema = v.object({ workflow_runs: v.array(GitHubRunSchema) });

export const GitHubDispatchRequestSchema = v.object({
  ref: v.string(),
  return_run_details: v.literal(true),
  inputs: v.object({
    job_id: v.string(),
    apk_filename: v.string(),
    apk_url: v.string(),
    hook_sha: CommitSchema
  })
});

export type CompatibilityStatus = v.InferOutput<typeof CompatibilityStatusSchema>;
export type CompatibilityRequest = v.InferOutput<typeof CompatibilityRequestSchema>;
export type GitHubRun = v.InferOutput<typeof GitHubRunSchema>;
export type GitHubDispatchRequest = v.InferOutput<typeof GitHubDispatchRequestSchema>;
