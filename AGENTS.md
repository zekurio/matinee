# Matinee

Self-hosted media server: Hono + oRPC server, React web client, Postgres.
See README.md for setup and the auth design.

## Repository map

- `packages/contracts`: the oRPC contract and zod schemas. Every API change
  starts here. `paths.ts` lists the plain HTTP routes (streams, artwork,
  OIDC).
- `packages/client`: `createMatineeClient()`, the typed client for all apps.
- `packages/db`: Drizzle schema (`src/schema.ts`) and migrations.
- `packages/ui`: shadcn components (Base UI, `base-nova` style) and
  `globals.css` with the theme tokens.
- `apps/server`: Hono app (`src/app.ts`), RPC procedures (`src/rpc`), auth
  (`src/auth`), scanner and title grouping (`src/library`), metadata
  providers and refresh (`src/metadata`), streaming and artwork (`src/media`).
- `apps/web`: Vite React app. File routes live in `src/routes`;
  `src/routeTree.gen.ts` is generated.

## Development

- Use Node 24 and pnpm 11, not npm, Yarn, or Bun. The devenv shell provides
  both plus a repo-local Postgres.
- Run `pnpm verify` before finishing a change. CI runs the same checks plus
  `pnpm audit` and the web build.
- Lint is type-aware oxlint plus the anti-slop rules in `tools/oxlint`
  (borrowed from alloy). In practice:
  - Parse untrusted values (search params, JSON columns, provider payloads,
    error causes) with zod. `typeof` checks are rejected.
  - A parameter typed `unknown` must be named `cause`, and only for errors.
  - Use `satisfies` or a `Map` rather than annotating a literal as a
    `Record`.
  - Every `as` cast needs a `// SAFETY:` comment on its statement saying
    what makes it true. Prefer removing the cast.
  - Fix the code before reaching for a disable comment.
- No automated tests yet. Check affected flows by hand in the browser.
- Generate migrations with a descriptive snake_case name:
  `pnpm db:generate --name watch_progress`. Never edit a migration after it
  merges; add a new one.
- Add shadcn components from `packages/ui`:
  `pnpm dlx shadcn@latest add <name>`. The CLI's output is ours to edit.

## Boundaries

- Clients talk to the server only through the contract or the routes in
  `paths.ts`. Don't import server code into clients.
- Validate inputs in the contract schemas. Procedures throw `ORPCError` with a
  message the user can act on; anything 500 is logged and hidden.
- The server fetches only image URLs a metadata provider returned, stored in
  the `artwork` table. Never fetch a URL a client sent.
- Passkeys and OIDC redirects bind to `PUBLIC_URL`. Never derive origins from
  request headers.
- Auth cookies are HttpOnly and SameSite=Lax. Keep RPC on same-origin JSON
  POSTs so the CSRF reasoning in `app.ts` holds.
