import * as v from "valibot";

export const PasswordEnvelopeSchema = v.strictObject({
  v: v.literal(1),
  alg: v.literal("AES-GCM"),
  iv: v.string(),
  ciphertext: v.string()
});

export const PasswordEnvelopeJsonSchema = v.pipe(
  v.string(),
  v.parseJson(),
  PasswordEnvelopeSchema
);

export type PasswordEnvelope = v.InferOutput<typeof PasswordEnvelopeSchema>;
