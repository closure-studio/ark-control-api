import * as v from "valibot";

const PositiveIntegerStringSchema = v.pipe(
  v.string(),
  v.regex(/^[1-9]\d*$/),
  v.transform(Number),
  v.safeInteger()
);

export const IdParamSchema = v.object({
  id: PositiveIntegerStringSchema
});
