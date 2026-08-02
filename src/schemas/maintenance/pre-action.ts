import * as v from "valibot";

export const PassportLoginResponseSchema = v.object({
  code: v.number(),
  data: v.object({
    available_slot: v.number(),
    token: v.pipe(v.string(), v.trim(), v.nonEmpty())
  }),
  message: v.string()
});

export type PassportLoginResponse = v.InferOutput<typeof PassportLoginResponseSchema>;
