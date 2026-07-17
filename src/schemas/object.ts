import * as v from "valibot";

const ObjectSchema = v.custom<object>(
  (input) => typeof input === "object" && input !== null && !Array.isArray(input),
  "Request body must be an object."
);

export function objectSchema<const TEntries extends v.ObjectEntries>(entries: TEntries) {
  return v.intersect([ObjectSchema, v.object(entries)]);
}

export function strictObjectSchema<const TEntries extends v.ObjectEntries>(entries: TEntries) {
  return v.intersect([ObjectSchema, v.strictObject(entries)]);
}

export function recordSchema<const TValue extends v.GenericSchema>(value: TValue) {
  return v.intersect([ObjectSchema, v.record(v.string(), value)]);
}
