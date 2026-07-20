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
TASK_SERVER_BASE_URL
TASK_SERVER_AUTHORIZATION
QQBOT_TOKEN
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
npm test
npm run typecheck
npm run build
npm run deploy
```

Deploy `ark-ssh` before the first deployment of this Worker. Update
`OIDC_ISSUER` and the Google WIF provider together when moving to a custom
OIDC domain.

The authenticated control surface is exposed under `/api/vps`, `/api/accounts`,
`/api/operations`, `/api/releases`, and `/api/host-runs`. A release's Host Runs
are available under `/api/releases/:id/host-runs`. The migrations create the
seven-table schema, including `arknights_apk_host_runs` for per-VPS Helper
execution history and `arknights_maintenance_announcements` for the scheduled
Arknights maintenance monitor.

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
`oidc`, `pyhelper`, and `vps`. Cross-cutting HTTP helpers stay in
`src/utils/http`; request, response, environment, and domain data contracts stay
under `src/schemas` and export types inferred with Valibot. Shared and
domain-specific constants stay under `src/constants/<domain>`.

The APK delivery workflow is owned by
`src/services/apk-delivery/deployment-lifecycle.ts`. One Deployment rolls an APK
Release out to the VPS hosts enabled at detection time, while each Host Run is
tracked independently in D1 until Helper finishes. The scheduled entrypoint and
tests use the same lifecycle interface. All managed SSH commands retry
immediately up to three total connection attempts only when the SSH adapter
returns `connected: false`.

The maintenance monitor runs at `17 * * * *`. It fetches the latest ten
announcements from `https://ak.hypergryph.com/news`, applies deterministic
maintenance rules, and uses the existing Workers AI binding only when rules
are uncertain. Confirmed maintenance announcements are sent through the
existing QQBot binding and claimed in D1 before any external notification.
Claims transition to `completed` or `failed` and are never retried, which
prevents duplicate QQ notifications when a scheduled invocation overlaps or
crashes after sending. Expired claims are recorded as failed and skipped.
No additional secret is required beyond `QQBOT_TOKEN` and `QQBOT_UID`.

External data is validated with Valibot schemas before services can use it.
Hono JSON bodies, queries, and route parameters use the Standard Schema
validator, and data types are inferred from their runtime schemas. TypeScript
also enables `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`; the
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
