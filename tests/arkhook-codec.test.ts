import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { decodeFailureRecord, encodeFailureRecord } from "../src/utils/arkhook/record-codec";
import { failureRecord } from "./helpers/arkhook";

describe("versioned Brotli failure archives", () => {
  it("losslessly round-trips complete records with native extensions and Unicode", () => {
    const record = failureRecord();
    record.task.task_data.payload = "录像/阵容/失败原因".repeat(1000);
    const raw = Buffer.from(JSON.stringify(record));
    const blob = encodeFailureRecord(raw);
    expect(blob.subarray(0, 4).toString()).toBe("AKF1");
    expect(blob.byteLength).toBeLessThan(raw.byteLength / 10);
    expect(decodeFailureRecord(blob)).toEqual(record);
  });
  it("rejects unsupported encodings, truncated data and invalid decoded records", () => {
    expect(() => decodeFailureRecord(Buffer.from("AKF2invalid"))).toThrow("Unsupported");
    expect(() => decodeFailureRecord(Buffer.from("AKF1"))).toThrow();
    expect(() => decodeFailureRecord(encodeFailureRecord(Buffer.from("{}")))).toThrow();
  });
});
