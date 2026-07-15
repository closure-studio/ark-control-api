export const HEALTH_STATUS_VALUES = ["ok"] as const;

export type HealthStatus = (typeof HEALTH_STATUS_VALUES)[number];
