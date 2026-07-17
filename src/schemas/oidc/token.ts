import * as v from "valibot";

export const OidcTokenRequestSchema = v.object({
  audience: v.pipe(v.string(), v.trim(), v.nonEmpty("Audience is required."))
});
