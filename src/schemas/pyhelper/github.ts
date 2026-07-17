import * as v from "valibot";
import { objectSchema } from "../object";

const GitHubReleaseAssetSchema = objectSchema({
  name: v.exactOptional(v.string()),
  url: v.exactOptional(v.string()),
  size: v.exactOptional(v.number()),
  content_type: v.exactOptional(v.string())
});

export const GitHubReleaseSchema = objectSchema({
  tag_name: v.exactOptional(v.string()),
  assets: v.exactOptional(v.array(GitHubReleaseAssetSchema))
});

export type GitHubRelease = v.InferOutput<typeof GitHubReleaseSchema>;
