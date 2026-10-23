import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as v from "valibot";

const base = process.env.DEPLOYMENT_URL;
const admin = process.env.ADMIN_TOKEN;
const upload = process.env.ARKHOOK_UPLOAD_TOKEN;
if (!base || !admin || !upload) {
  throw new Error("DEPLOYMENT_URL, ADMIN_TOKEN and ARKHOOK_UPLOAD_TOKEN are required.");
}
const path = "/api/arkhook/task-failures";

/**
 * @param {string} suffix
 * @param {Parameters<typeof fetch>[1]} options
 */
async function request(suffix, options) {
  // A response body or credential is never included in deployment logs.
  const response = await fetch(new URL(path + suffix, base), {
    ...options,
    signal: AbortSignal.timeout(30_000)
  });
  assert.equal(response.headers.get("content-type")?.includes("application/json"), true);
  return response;
}

const response = await request("?limit=1", { headers: { authorization: "Bearer " + admin } });
assert.equal(response.status, 200, "Archive query must succeed against migrated remote D1.");
const body = v.parse(
  v.object({
    data: v.object({
      records: v.array(
        v.strictObject({
          task_id: v.string(),
          stage_id: v.nullable(v.string()),
          battle_rank: v.nullable(v.number()),
          recorded_at: v.number()
        })
      ),
      pagination: v.object({ limit: v.number(), total: v.pipe(v.number(), v.safeInteger()) })
    })
  }),
  await response.json()
);
assert.ok(Array.isArray(body.data?.records));
assert.equal(body.data.pagination.limit, 1);
assert.ok(Number.isSafeInteger(body.data.pagination.total));
for (const record of body.data.records) {
  assert.deepEqual(Object.keys(record).sort(), [
    "battle_rank",
    "recorded_at",
    "stage_id",
    "task_id"
  ]);
}
const missing = await request("/" + randomUUID(), {
  headers: { authorization: "Bearer " + admin }
});
assert.equal(missing.status, 404, "Detail query must reach the migrated BLOB column.");
const anonymous = await request("", {});
assert.equal(anonymous.status, 401);
const denied = await request("", {
  method: "POST",
  headers: {
    authorization: "Bearer " + admin,
    "content-type": "application/json"
  },
  body: "{}"
});
assert.equal(denied.status, 401, "Admin credentials must not grant archive upload access.");
const uploadAuth = await request("", {
  method: "POST",
  headers: { authorization: "Bearer " + upload, "content-type": "application/json" },
  body: "{}"
});
assert.equal(uploadAuth.status, 400, "Upload secret must authenticate before JSON validation.");
const uploadError = v.parse(
  v.object({ error: v.object({ code: v.literal("bad_request") }) }),
  await uploadAuth.json()
);
assert.equal(uploadError.error.code, "bad_request");
const uploadRead = await request("", { headers: { authorization: "Bearer " + upload } });
assert.equal(uploadRead.status, 401, "Upload credentials must not grant archive read access.");
console.log(
  "ArkHook archive deployed: remote D1 queries, upload secret and authorization checks passed."
);
