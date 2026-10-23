import {
  MAX_COMPRESSED_FAILURE_BYTES,
  MAX_FAILURE_JSON_BYTES
} from "../../constants/arkhook/config";
import { encodeFailureRecord } from "../../utils/arkhook/record-codec";
import { API_ERROR_CODES } from "../../constants/api/error-codes";
import { ControlApiError } from "../../errors/control-api";
import { getTaskFailure, listTaskFailures, saveTaskFailure } from "../../repositories/arkhook";
import type { TaskFailureListQuery, TaskFailureUpload } from "../../schemas/arkhook/requests";

export async function uploadTaskFailure(db: D1Database, record: TaskFailureUpload) {
  const raw = new TextEncoder().encode(record.record_json);
  if (raw.byteLength > MAX_FAILURE_JSON_BYTES) {
    throw new ControlApiError(
      API_ERROR_CODES.PAYLOAD_TOO_LARGE,
      "Failure JSON exceeds 8,000,000 UTF-8 bytes.",
      413
    );
  }
  const compressed = encodeFailureRecord(raw);
  if (compressed.byteLength > MAX_COMPRESSED_FAILURE_BYTES) {
    throw new ControlApiError(
      API_ERROR_CODES.PAYLOAD_TOO_LARGE,
      "Compressed failure record exceeds 1,900,000 bytes.",
      413
    );
  }
  await saveTaskFailure(db, { ...record, record_json: compressed });
  return { task_id: record.task_id };
}

export function listFailures(db: D1Database, query: TaskFailureListQuery) {
  return listTaskFailures(db, query);
}

export function getFailure(db: D1Database, taskId: string) {
  return getTaskFailure(db, taskId);
}
