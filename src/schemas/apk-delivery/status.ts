import * as v from "valibot";

import { HOST_RUN_STATUSES, TERMINAL_HOST_RUN_STATUSES } from "../../constants/apk-delivery/status";

export const HostRunStatusSchema = v.picklist(HOST_RUN_STATUSES);
export const TerminalHostRunStatusSchema = v.picklist(TERMINAL_HOST_RUN_STATUSES);

export type HostRunStatus = v.InferOutput<typeof HostRunStatusSchema>;
export type TerminalHostRunStatus = v.InferOutput<typeof TerminalHostRunStatusSchema>;

export function isTerminalHostRunStatus(status: HostRunStatus): status is TerminalHostRunStatus {
  return v.is(TerminalHostRunStatusSchema, status);
}
