# ark-control-api

Cloudflare Worker for the Ark control plane. It owns the single D1 database,
GCP Workload Identity Federation, VPS configuration, APK delivery automation,
Workers AI, OIDC discovery/JWKS, and scheduled jobs.

## Setup

```sh
npm install
npx wrangler d1 create ark_control
```

Copy the returned database ID into `wrangler.toml`, then apply the migrations:

```sh
npx wrangler d1 migrations apply ark_control --local
npx wrangler d1 migrations apply ark_control --remote
```

The current migration history is a single development baseline and assumes an
empty database. Do not apply it over a database that used an older migration
history. During development resets, delete and recreate `ark_control`, replace
its `database_id` in `wrangler.toml`, and then apply the baseline remotely.

The D1 schema is defined in `src/db/schema.ts`. Generate future SQL migrations
with Drizzle Kit, review the generated SQL, then apply it with Wrangler:

```sh
npm run db:generate -- --name=<migration_name>
npm run db:check
npm run db:verify
npx wrangler d1 migrations apply ark_control --local
npx wrangler d1 migrations apply ark_control --remote
```

Configure these Worker secrets:

```text
ADMIN_TOKEN
VPS_PASSWORD_KEY
OIDC_PRIVATE_KEY_PEM
PUBLIC_TOKEN_BEARER_SECRET
GITHUB_PYHELPER_TOKEN
QQBOT_TOKEN
ARKHOST_PASSPORT_EMAIL
ARKHOST_PASSPORT_PASSWORD
```

`VPS_PASSWORD_KEY` is a base64-encoded 32-byte AES key. The `ARK_SSH` service
binding targets the `ArkSshRpc` entrypoint exported by `ark-ssh`.
The machine account registration endpoint also requires `ADMIN_TOKEN`; the
Cloud Shell setup script prompts for it without storing it in the script.

## Commands

```sh
npm run db:check
npm run db:generate -- --name=<migration_name>
npm run db:verify
npm run dev
npm run lint
npm run format:check
npm test
npm run typecheck
npm run build
npm run deploy
```

Deploy `ark-ssh` before the first deployment of this Worker. Update
`OIDC_ISSUER` and the Google WIF provider together when moving to a custom
OIDC domain. GitHub Actions also requires an `ADMIN_TOKEN` repository secret
whose value matches the Worker's `ADMIN_TOKEN`; the deployment workflow uses it
to create or repair all six Durable Object Alarms after publishing.

The authenticated control surface is exposed under `/api/arkhook/task-failures`, `/api/vps`, `/api/accounts`,
`/api/operations`, `/api/releases`, `/api/host-runs`, and
`/api/scheduler/ensure`. A release's Host Runs are available under
`/api/releases/:id/host-runs`. The scheduler endpoint is idempotent and exists
for deployment bootstrap and manual disaster recovery. The migration creates
the seven-table schema, including `arknights_apk_host_runs` for per-VPS Helper
execution history, `arknights_maintenance_announcements` for the scheduled
Arknights maintenance monitor, and `arknights_maintenance_host_runs` for
per-ArkHost maintenance restart auditing.

## ArkHook failure archives

The API accepts the existing version-1 ArkHook non-three-star record as plain JSON
text with `Content-Type: application/json`. The full task, completion, node identity and unknown
extension fields are preserved. Normally completed three-star tasks are rejected;
low-star Completed results, defeat, timeout, cancellation, startup/cleanup errors,
and task-server protocol errors remain archivable. Invalid battle inputs are
preserved so they can be reproduced.

Configure `ARKHOOK_UPLOAD_TOKEN` in the repository's GitHub Actions secrets.
CI/CD requires it and synchronizes it to the Worker using wrangler-action's
`secrets` input on every deployment. No separate dashboard configuration is
needed. For manual deployments, use `npx wrangler secret put ARKHOOK_UPLOAD_TOKEN`.
The upload endpoint fails closed while this secret is absent. It does not accept
`ADMIN_TOKEN`; the upload token cannot read archives or call management APIs.
Existing deployment secrets and public routes are unchanged.

- `POST /api/arkhook/task-failures`: upload the complete record with
  `Authorization: Bearer <ARKHOOK_UPLOAD_TOKEN>`. Returns
  `{ "data": { "task_id": "<uuid>" } }` after D1 confirms the write.
- `GET /api/arkhook/task-failures`: admin-only summary list. Supports `limit`
  (default 50, maximum 100), `offset` (default 0), `stage_id`, `battle_rank`
  (0–3), and inclusive `recorded_from`/`recorded_to` UTC millisecond timestamps.
  Returns `{ "data": { "records": [...], "pagination": { "limit", "offset", "count", "total" } } }`.
  Summaries contain only the four indexed metadata fields. Results sort by
  `recorded_at DESC, task_id DESC`.
- `GET /api/arkhook/task-failures/:task_id`: admin-only complete record under
  `data`, automatically decompressed, or 404 if missing.

The additive migration creates exactly five columns: `task_id` (globally unique
UUID primary key), nullable `stage_id`, nullable `battle_rank`, integer
`recorded_at`, and binary `record_json`. The API derives every metadata column
from the body; callers do not submit separate summaries. `record_json` is a BLOB
containing the four-byte ASCII header `AKF1` followed by Brotli-compressed UTF-8
JSON. Compression always uses maximum quality 11, text mode and window 24;
there is no lower-quality fallback, Base64 encoding or extra codec column.
The header versions the storage format independently of the record's JSON version.
The Worker enables `nodejs_compat` for native `node:zlib` support.

Requests are limited to 8,500,000 bytes and validated JSON to 8,000,000 UTF-8 bytes.
The compressed BLOB must fit within 1,900,000 bytes, leaving space below D1's
2 MB row limit. Oversized records return HTTP 413 with error code
`payload_too_large` and never replace an existing row. Highly compressible JSON
larger than 2 MB is accepted. Decoding also bounds decompressed output.
Brotli quality 11 consumes CPU: three production failure records of 117–243 KB
compressed to 8.7–9.1% of their original size in approximately 0.22–0.43 seconds
locally, smaller than gzip 9 and zstd 22 on all three samples.
Production uploads need a Worker CPU budget that accommodates this work.

A successful re-upload upserts the same `task_id`; the last accepted snapshot
wins and retries never create additional rows. Uploaders must serialize uploads
per task and submit the final local snapshot after task-server conflict handling.
There is no server-side revision or historical attempt table. No retention job
automatically removes failure archives. Responses use `Cache-Control: no-store`.

CI checks the additive migration and runs HTTP-to-D1 tests in the Workers runtime,
including lossless Brotli BLOB storage, >2 MB raw JSON, size limits and credential
isolation. On merge to main, CI/CD applies remote D1 migrations, deploys the Worker,
bootstraps existing alarms, then runs `scripts/verify-arkhook-deployment.mjs`.
That read-only smoke check queries list and detail routes against remote D1 and
verifies unauthorized access, without creating synthetic production records.
The deployment also synchronizes the upload secret and verifies that it reaches
JSON validation (HTTP 400 for an intentionally incomplete body) while remaining
unable to read archives. It creates no production archive records.

## Architecture

Source code uses top-level responsibility layers, with related files grouped by
domain inside each layer:

```text
src/
|-- constants/       stable configuration values and protocol constants
|-- controller/      business use cases exposed to HTTP handlers
|-- db/              Drizzle client and schema
|-- errors/          runtime application error classes
|-- repositories/    database access grouped by domain
|-- router/          Hono route registration grouped by HTTP domain
|-- schemas/         Valibot data contracts and their inferred types
|-- services/        external integrations and domain workflows
`-- utils/           stateless helpers grouped by concern
```

The HTTP dependency direction is `router -> controller -> service/repository`.
The current router and controller domains are `apk-delivery`, `gcp`, `health`,
`oidc`, `pyhelper`, `scheduler`, `arkhook`, `public-announcements`, and `vps`. Cross-cutting HTTP helpers stay in
`src/utils/http`; request, response, environment, and domain data contracts stay
under `src/schemas` and export types inferred with Valibot. Shared and
domain-specific constants stay under `src/constants/<domain>`.

Scheduled business work is owned by one SQLite-backed Durable Object class with
six named instances: APK delivery, maintenance monitoring, maintenance
pre-action, retention, public announcement collection, and GCP instance keepalive. Each instance has one Alarm and therefore one
serialized job stream. D1 stores only business state and audit history; there
is no scheduler or distributed-lock table. A deployment calls the authenticated
scheduler endpoint immediately after the Worker is published. Successful Alarm
invocations install their business-derived next Alarm. Unexpected failures use
Cloudflare's six automatic retries; the final failed attempt installs a
five-minute recovery Alarm instead of letting the chain end. A single
`0 12 * * *` UTC Cron trigger is only a daily disaster-recovery watchdog that
creates a missing Alarm or moves a late Alarm earlier.

The APK delivery workflow exposes its scheduling interface from
`src/services/apk-delivery/deployment-lifecycle.ts`; Host Run state transitions
and Release reconciliation remain internal modules. One Deployment rolls an APK
Release out to the VPS hosts enabled at detection time, while each Host Run is
tracked independently in D1 until Helper finishes. When idle, it checks for a
release on exact UTC ten-minute boundaries. A running Host Run is checked ten
minutes after start and after each subsequent check, with its six-hour deadline
also able to wake the Alarm. All managed SSH commands retry
immediately up to three total connection attempts only when the SSH adapter
returns `connected: false`.

The maintenance monitor runs at the top of every UTC hour. It fetches the latest
ten announcements from the official
site's paginated `/api/news` JSON endpoint,
fetches each detail from `https://ak.hypergryph.com/news/:id`, applies
deterministic maintenance rules, and uses the existing Workers AI binding only
when rules are uncertain. Confirmed maintenance announcements are sent through
the existing QQBot binding and claimed in D1 before any external notification.
Rows transition to `completed` or `failed` and are never retried, which
prevents duplicate QQ notifications when a scheduled invocation overlaps or
crashes after sending. A row left in `processing` by an interrupted Alarm is
recorded as failed and skipped. No
additional secret is required beyond `QQBOT_TOKEN` and `QQBOT_UID`.

The maintenance pre-action Alarm is scheduled directly from D1. Deterministic
stop-maintenance announcements with a complete China Standard Time start are
scheduled two hours early. A task that reaches the maintenance start before it
runs is marked `missed`; interrupted execution is marked `interrupted`. The
workflow first verifies that enabled `arkhost` hosts exist, then logs in to
Passport, disables game login over HTTPS, and restarts those hosts in
parallel with `cd ~/ArkHost && ./arkhostctl.sh restart`. A task has one business
attempt, while each SSH command retains the shared three-attempt reconnect
behavior for connection failures. QQ notifications report the start and terminal
outcome of each claimed task, as well as missed or interrupted tasks; notification
failures are logged without changing the maintenance result. AI-only maintenance
classifications never trigger this workflow, and the workflow does not re-enable
login after the maintenance window.

GCP instance keepalive runs on exact UTC ten-minute boundaries. It uses enabled
GCP accounts to discover instances across all zones and pages, then matches exact
instance names against all registered VPS hosts. Names duplicated across projects
or zones are skipped; incomplete discovery fails the cycle before any cloud or
VPS mutation. A matched `TERMINATED` instance receives a start request without
waiting for its operation. A later cycle synchronizes its current external IP
once discovery reports it as `RUNNING`; missing IPs never clear stored addresses.
Address updates require the VPS name to still match, so a concurrent rename
cannot receive the old instance's IP. Individual GCP start-request failures,
including capacity shortages, are logged and retried on the next cycle without
blocking other matched hosts. Database failures propagate to the Alarm's existing
retry and recovery handling.
There is no new table, secret, switch, notification, or automatic recreation.
The business watcher switch does not control keepalive. Manually stopped matched
instances are also restarted; rename/remove the VPS registration or disable the
GCP account to exclude it. VPS names must remain identical to GCP instance names.

Retention runs at `00:00 UTC` daily. Fixed schedules deliberately use natural
UTC boundaries, so there are no minute-17 or `03:15` offsets to coordinate.

External data is validated with Valibot schemas before services can use it.
Hono JSON bodies, queries, and route parameters use the Standard Schema
validator, and data types are inferred from their runtime schemas. Separate
TypeScript projects cover the Worker runtime, tests, and Node-based tooling,
while sharing strict options including `exactOptionalPropertyTypes` and
`noUncheckedIndexedAccess`. Type-aware ESLint catches unsafe Promise handling
and non-exhaustive switches, Prettier owns source formatting, and the
architecture tests reject explicit `any`, unchecked type assertions, direct
unvalidated Hono request reads, and parallel declarations of Schema-derived
contracts in production source.

## API responses

JSON endpoints under `/api/*` use one of two mutually exclusive envelopes:

```json
{ "data": {}, "meta": {} }
```

```json
{ "error": { "code": "not_found", "message": "Resource was not found.", "details": {} } }
```

The HTTP status remains authoritative. Error `code` values are stable machine
identifiers; clients must not parse `message`. The `meta` and `details` members
are omitted when unused. OIDC responses, health checks, and successful binary
downloads retain their protocol-specific formats.

GCP provisioning registers the new instance as a standalone SSH host. VPS rows
do not retain GCP ownership or instance identity, so deleting a VPS or account
configuration does not delete the corresponding cloud resource.
