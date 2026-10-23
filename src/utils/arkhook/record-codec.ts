import { Buffer } from "node:buffer";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import * as v from "valibot";
import { MAX_FAILURE_JSON_BYTES } from "../../constants/arkhook/config";
import { StoredTaskFailureSchema } from "../../schemas/arkhook/records";

// AKF1 identifies Brotli-compressed UTF-8 JSON without adding a database column.
const MAGIC = Buffer.from("AKF1", "ascii");

export function encodeFailureRecord(json: Uint8Array): Buffer {
  const compressed = brotliCompressSync(json, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
      [constants.BROTLI_PARAM_LGWIN]: 24,
      [constants.BROTLI_PARAM_SIZE_HINT]: json.byteLength
    }
  });
  return Buffer.concat([MAGIC, compressed]);
}

export function decodeFailureRecord(blob: Buffer) {
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Unsupported ArkHook failure record encoding.");
  }
  const json = brotliDecompressSync(blob.subarray(MAGIC.length), {
    maxOutputLength: MAX_FAILURE_JSON_BYTES
  });
  return v.parse(StoredTaskFailureSchema, json.toString("utf8"));
}
