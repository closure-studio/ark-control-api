# Agent-Specific Instructions

Read [README.md](README.md) before making changes. The README is the source of
truth for the project overview, setup, commands, source layout, dependency
direction, validation approach, and API behavior. Do not duplicate those topics
in this file; this file only records implementation rules that agents commonly
miss.

## Code discovery

When `.codegraph/` exists, use `codegraph explore "<question or symbols>"`
before `rg`, `find`, or broad file reads when locating or understanding code.
Use `rg` afterward to verify exact current files or when CodeGraph returns an
incomplete result.

## Schema implementation

- For a reusable data contract, define the Valibot Schema first and export its
  type from the same module with `v.InferOutput<typeof Schema>`.
- Do not create a parallel interface or type alias that duplicates a Schema.
- If raw input and normalized output differ, define separate request and
  normalized Schemas so both public types can come from `v.InferOutput`.
- Put defaults, trimming, field renaming, filtering, and normalization in the
  Schema pipeline.
- Use `v.object` directly. Do not wrap it merely to change the inferred object
  type or work around an `object & T` result.
- Derive database row types from the Drizzle schema with `$inferSelect` or
  `$inferInsert`.
- Keep function and dependency-injection capability types local to their owning
  implementation module.
- Remove unused or synonymous types instead of migrating them mechanically.
- Do not recreate `src/types`, `src/validation`, `src/schemas/object.ts`, vague
  catch-all Schema files such as `json.ts` or `http.ts`, or parallel shared
  router layers.

## Hono request handling

- Attach the appropriate Valibot Schema with `@hono/standard-validator` for
  every validated `json`, `query`, or `param` input.
- Treat `c.req.valid(...)` as already validated and normalized. Pass it directly
  to the controller when the controller accepts the complete object.
- Do not repeat `typeof`, empty-string, range, or optional-field checks in a
  router when they describe request validity.
- Do not add defaults, rename fields, filter optional values, or reshape a
  validated request in a router. Change the Schema output to match the
  controller input.
- Do not use `c.req.json()`, manual request-body parsing, or `JSON.parse` for
  Hono request bodies.
- Authorization, not-found handling, response status selection, and HTTP error
  mapping are boundary behavior rather than duplicate input validation.

## External data

- For JSON embedded in a string, use `v.parseJson()` followed by its concrete
  Schema instead of `JSON.parse` and a cast.
- Return successful Schema output directly unless subsequent business logic
  intentionally changes it.

## TypeScript discipline

- `as const` for literal constants is the only assertion exception permitted by
  the repository's architecture checks.
- Use `unknown` only at a genuinely untrusted boundary and narrow it immediately
  through validation.
- Fix a Schema or generic constraint when inference is wrong; do not mask the
  problem with an intersection or assertion.
- Keep changes scoped and preserve unrelated work already in the worktree.

## Placement and verification

- Name Schema files after their domain contract, such as `accounts.ts`,
  `operations.ts`, `protocol.ts`, `requests.ts`, or `responses.ts`.
- Keep shared HTTP serialization and validation hooks in `src/utils/http`.
- When changing the source layout or a layer rule, update both README.md and
  `tests/architecture.test.ts`.
- Add focused tests for Schema rejection, defaults, and transformed output.
- Add regression coverage when behavior crosses router, controller, and
  repository boundaries.
- Run `npm run typecheck` while developing and the full `npm run ci` before
  handing off a completed code change.
- Do not commit or push unless the user explicitly requests it.
