import { APP_NAME } from "../constants/app";
import type { HealthResponse } from "../model/health";

export const createHealthResponse = (): HealthResponse => ({
  name: APP_NAME,
  status: "ok",
});
