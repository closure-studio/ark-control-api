import type { HealthResponse } from "../../schemas/health/responses";

export function getHealthData(now = new Date()): HealthResponse {
  return {
    ok: true,
    service: "ark-control-api",
    time: now.toISOString()
  };
}
