const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function nextUtcHour(now: Date): Date {
  return nextUtcBoundary(now, HOUR_MS);
}

export function nextUtcMidnight(now: Date): Date {
  return nextUtcBoundary(now, DAY_MS);
}

function nextUtcBoundary(now: Date, intervalMs: number): Date {
  return new Date((Math.floor(now.getTime() / intervalMs) + 1) * intervalMs);
}
