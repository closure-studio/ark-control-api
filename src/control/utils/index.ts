export function getHealthData(now = new Date()) {
  return {
    ok: true as const,
    service: "ark-control-api" as const,
    time: now.toISOString()
  };
}
