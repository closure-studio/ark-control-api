import * as v from "valibot";

export const PyHelperAssetNameSchema = v.picklist(["Helper-arm64", "Helper-amd64"]);

export const PyHelperAssetParamSchema = v.object({
  assetName: PyHelperAssetNameSchema
});

export const PyHelperDownloadQuerySchema = v.object({
  expires: v.pipe(
    v.string("expires is required"),
    v.regex(/^\d+$/, "expires must be an integer"),
    v.transform(Number),
    v.safeInteger("expires must be an integer")
  ),
  signature: v.pipe(v.string("signature is required"), v.nonEmpty("signature is required"))
});

export type PyHelperAssetName = v.InferOutput<typeof PyHelperAssetNameSchema>;
export type PyHelperDownloadQuery = v.InferOutput<typeof PyHelperDownloadQuerySchema>;
