import * as v from "valibot";
import { objectSchema } from "../object";

export const PyHelperAssetNameSchema = v.picklist(["Helper-arm64", "Helper-amd64"]);

export const PyHelperAssetParamSchema = objectSchema({
  assetName: PyHelperAssetNameSchema
});

export type PyHelperAssetName = v.InferOutput<typeof PyHelperAssetNameSchema>;
