import * as v from "valibot";
import { objectSchema } from "../object";

export const OidcTokenRequestSchema = objectSchema({
  audience: v.pipe(v.string(), v.trim(), v.nonEmpty("Audience is required."))
});
