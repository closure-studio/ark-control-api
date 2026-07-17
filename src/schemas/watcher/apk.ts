import * as v from "valibot";

export const ApkMetadataSchema = v.object({
  finalUrl: v.string(),
  apkFilename: v.string()
});

export type ApkMetadata = v.InferOutput<typeof ApkMetadataSchema>;
