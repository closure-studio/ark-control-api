import type { HealthStatus } from "../schema/health";

export interface HealthResponse {
  name: string;
  status: HealthStatus;
}
