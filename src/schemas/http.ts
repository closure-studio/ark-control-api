import * as v from "valibot";
import { objectSchema } from "./object";

const PositiveIntegerStringSchema = v.pipe(
  v.string(),
  v.regex(/^[1-9]\d*$/),
  v.transform(Number),
  v.safeInteger()
);

const NonNegativeIntegerStringSchema = v.pipe(
  v.string(),
  v.regex(/^\d+$/),
  v.transform(Number),
  v.safeInteger()
);

export const IdParamSchema = objectSchema({
  id: PositiveIntegerStringSchema
});

export const PaginationQuerySchema = objectSchema({
  limit: v.exactOptional(
    v.pipe(NonNegativeIntegerStringSchema, v.transform((value) => Math.min(value, 100)))
  ),
  offset: v.exactOptional(NonNegativeIntegerStringSchema)
});
