import * as v from "valibot";

const NonNegativeIntegerStringSchema = v.pipe(
  v.string(),
  v.regex(/^\d+$/),
  v.transform(Number),
  v.safeInteger()
);

export const PaginationQueryEntries = {
  limit: v.exactOptional(
    v.pipe(NonNegativeIntegerStringSchema, v.transform((value) => Math.min(value, 100)))
  ),
  offset: v.exactOptional(NonNegativeIntegerStringSchema)
};

export const PaginationQuerySchema = v.pipe(
  v.object(PaginationQueryEntries),
  v.transform(({ limit, offset }) => ({
    limit: limit ?? 50,
    offset: offset ?? 0
  }))
);
