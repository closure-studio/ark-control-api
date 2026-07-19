import * as v from "valibot";

import { PaginationQueryEntries } from "../pagination";

export const HOST_RUN_LIST_STATES = ["all", "active", "terminal"] as const;

export const HostRunListQuerySchema = v.pipe(
  v.object({
    ...PaginationQueryEntries,
    state: v.exactOptional(v.picklist(HOST_RUN_LIST_STATES))
  }),
  v.transform(({ limit, offset, state }) => ({
    limit: limit ?? 50,
    offset: offset ?? 0,
    state: state ?? "all"
  }))
);

export type HostRunListQuery = v.InferOutput<typeof HostRunListQuerySchema>;
