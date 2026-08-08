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
to create or repair all four Durable Object Alarms after publishing.

The authenticated control surface is exposed under `/api/vps`, `/api/accounts`,
`/api/operations`, `/api/releases`, `/api/host-runs`, and
`/api/scheduler/ensure`. A release's Host Runs are available under
`/api/releases/:id/host-runs`. The scheduler endpoint is idempotent and exists
for deployment bootstrap and manual disaster recovery. The migration creates
the seven-table schema, including `arknights_apk_host_runs` for per-VPS Helper
execution history, `arknights_maintenance_announcements` for the scheduled
Arknights maintenance monitor, and `arknights_maintenance_host_runs` for
per-ArkHost maintenance restart auditing.

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
`oidc`, `pyhelper`, `scheduler`, and `vps`. Cross-cutting HTTP helpers stay in
`src/utils/http`; request, response, environment, and domain data contracts stay
under `src/schemas` and export types inferred with Valibot. Shared and
domain-specific constants stay under `src/constants/<domain>`.

Scheduled business work is owned by one SQLite-backed Durable Object class with
four named instances: APK delivery, maintenance monitoring, maintenance
pre-action, and retention. Each instance has one Alarm and therefore one
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
