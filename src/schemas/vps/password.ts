import * as v from "valibot";
import { strictObjectSchema } from "../object";

export const PasswordEnvelopeSchema = strictObjectSchema({
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
