import * as v from "valibot";

export const MaintenanceAiJsonSchema = v.strictObject({
  is_maintenance: v.boolean(),
  confidence: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  maintenance_start: v.nullable(v.string()),
  maintenance_end: v.nullable(v.string()),
  reason: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  summary: v.pipe(v.string(), v.trim(), v.nonEmpty())
});

export const MaintenanceAiJsonTextSchema = v.pipe(
  v.string(),
  v.trim(),
  v.parseJson(),
  MaintenanceAiJsonSchema
);

export type MaintenanceAiJson = v.InferOutput<typeof MaintenanceAiJsonSchema>;
