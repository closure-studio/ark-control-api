# ark-control-api

Cloudflare Worker for the Ark control plane. It owns the single D1 database,
GCP Workload Identity Federation, VPS configuration, Watcher automation,
Workers AI, OIDC discovery/JWKS, and scheduled jobs.

## Setup

```sh
npm install
npx wrangler d1 create ark_control
```

Copy the returned database ID into `wrangler.toml`, then apply the clean
baseline migration:

```sh
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

## Commands

```sh
npm run dev
npm test
npm run typecheck
npm run build
npm run deploy
```

Deploy `ark-ssh` before the first deployment of this Worker. Update
`OIDC_ISSUER` and the Google WIF provider together when moving to a custom
OIDC domain.

The authenticated control surface is exposed under `/api/dashboard`,
`/api/vps`, `/api/accounts`, `/api/releases`, and `/api/runs`. Apply all D1
migrations before deploying a version that uses the simplified VPS inventory.

Migration `0004_lean_schema.sql` preserves existing account, operation, and
deployment rows while removing unused columns and write-only AI review history.

GCP provisioning registers the new instance as a standalone SSH host. VPS rows
do not retain GCP ownership or instance identity, so deleting a VPS or account
configuration does not delete the corresponding cloud resource.
