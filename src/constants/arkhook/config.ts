// Raw JSON stays bounded independently of its compressed storage size.
export const MAX_FAILURE_JSON_BYTES = 8_000_000;
export const MAX_FAILURE_REQUEST_BYTES = 8_500_000;
// Leave space for the indexed metadata below D1's 2 MB row limit.
export const MAX_COMPRESSED_FAILURE_BYTES = 1_900_000;
export const TASK_FAILURES_PATH = "/api/arkhook/task-failures";
