import * as v from "valibot";

const GitHubReleaseAssetSchema = v.object({
  name: v.exactOptional(v.string()),
  url: v.exactOptional(v.string()),
  size: v.exactOptional(v.number()),
  content_type: v.exactOptional(v.string())
});

export const GitHubReleaseSchema = v.object({
  tag_name: v.exactOptional(v.string()),
  assets: v.exactOptional(v.array(GitHubReleaseAssetSchema))
});

export type GitHubRelease = v.InferOutput<typeof GitHubReleaseSchema>;
