import * as v from "valibot";

import { MAINTENANCE_PRE_ACTION_LEAD_MS } from "../../constants/maintenance/config";
import {
  MaintenancePreActionScheduleSchema,
  type MaintenancePreActionSchedule
} from "../../schemas/maintenance/announcements";

const FULL_CHINESE_DATE_TIME = /^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{2})$/;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function buildMaintenancePreActionSchedule(
  maintenanceStart: string | null
): MaintenancePreActionSchedule | null {
  if (maintenanceStart === null) return null;
  const match = FULL_CHINESE_DATE_TIME.exec(maintenanceStart.trim());
  if (!match) return null;

  const parts = match.slice(1).map(Number);
  const [year, month, day, hour, minute] = parts;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    return null;
  }

  const maintenanceStartMs = Date.UTC(year, month - 1, day, hour, minute) - SHANGHAI_OFFSET_MS;
  const shanghaiDate = new Date(maintenanceStartMs + SHANGHAI_OFFSET_MS);
  if (
    shanghaiDate.getUTCFullYear() !== year ||
    shanghaiDate.getUTCMonth() !== month - 1 ||
    shanghaiDate.getUTCDate() !== day ||
    shanghaiDate.getUTCHours() !== hour ||
    shanghaiDate.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return v.parse(MaintenancePreActionScheduleSchema, {
    maintenanceStartAt: new Date(maintenanceStartMs).toISOString(),
    preActionAt: new Date(maintenanceStartMs - MAINTENANCE_PRE_ACTION_LEAD_MS).toISOString()
  });
}
