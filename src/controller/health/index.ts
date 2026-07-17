export function getHealthData(now = new Date()): {
  ok: true;
  service: "ark-control-api";
  time: string;
} {
  return {
    ok: true,
    service: "ark-control-api",
    time: now.toISOString()
  };
}
