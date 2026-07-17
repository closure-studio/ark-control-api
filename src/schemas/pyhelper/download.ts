import * as v from "valibot";

export const PyHelperAssetNameSchema = v.picklist(["Helper-arm64", "Helper-amd64"]);

export const PyHelperAssetParamSchema = v.object({
  assetName: PyHelperAssetNameSchema
});

export type PyHelperAssetName = v.InferOutput<typeof PyHelperAssetNameSchema>;
