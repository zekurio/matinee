# Matinee

Self-hosted media server: Hono + oRPC server, React web client, Postgres.
README.md introduces the project, and CONTRIBUTING.md sets up the dev
shell. Each app's README has the rest: `apps/server/README.md` for
hosting, NixOS included, configuration, auth, and how the server behaves,
`apps/web/README.md` for translations, `apps/flutter/README.md` for the
app for phones, tablets, and TVs, `apps/tizen/README.md` for the Samsung
TV app.

## Repository map

- `packages/contracts`: the oRPC contract and its TypeBox schemas, written
  with the zod-like `t` builder from `@matinee/contracts/schema`
  (`src/schema.ts`, from alloy). A `t` schema is also a Standard Schema, so
  oRPC, TanStack Router's `validateSearch`, and TanStack Form take it as is.
  Defaults are `$default(...)`, since `default` is the JSON Schema keyword.
  Every API change starts here, including the REST method and path each
  procedure gets under `/api/v1`. `paths.ts` lists the plain HTTP routes
  (streams, artwork, OIDC).
- `packages/client`: `createMatineeClient()`, the typed client for all apps.
- `packages/db`: Drizzle schema (`src/schema/`, one file per domain) and migrations.
- `packages/ui`: shadcn components (Base UI, `base-nova` style) and
  `globals.css` with the theme tokens.
- `apps/server`: Hono app (`src/app.ts`), RPC procedures (`src/rpc`), auth
  (`src/auth`), scanner and title grouping (`src/library`), metadata
  providers and refresh (`src/metadata`), streaming and artwork (`src/media`),
  job queues and scheduled tasks (`src/jobs`), in-process events and live
  streams (`src/realtime`), watch parties, which live in memory
  (`src/party`).
- `apps/server/src/access`: account policies, viewers, and the shared library visibility filters.
- `apps/web`: Vite React app. File routes live in `src/routes`;
  `src/routeTree.gen.ts` is generated.
- `brand/`: the logo, the wordmark, and the app icons, with the
  scripts that draw the wordmark and render their PNGs, the web app's
  favicon, and `apps/web/src/components/logo.gen.ts`. See `brand/README.md`.
- `apps/flutter`: the app for phones, tablets, and TVs, one Flutter
  codebase with each platform's player behind the Flutter view. It ships
  for Android, Android tablets, and Android TV. Its iPhone and iPad side,
  `ios/Runner`, compiles in CI and has run on simulators, but not yet on
  a device. Its Apple TV side, `tvos/`, builds on Plezy's tvOS engine and
  shares `ios/Runner`'s player. CI compiles it, and nobody has run it
  yet. Its API client,
  `lib/api`, is
  generated from the OpenAPI document by `pnpm api:dart`
  (`apps/server/scripts/dart-client.ts`), and its theme presets, icons,
  and logo by `pnpm themes:dart`, `pnpm icons:dart`, and
  `pnpm logo:dart`.
  `pnpm strings:dart` copies shared web messages into the ARBs and
  generates the server message lookup. `pnpm verify` checks all five.
  Screens build from `lib/kit`, its port of `packages/ui`; only
  the kit and `lib/app.dart` import Material or Cupertino, and
  `test/kit_boundary_test.dart` holds that. Strings live in ARB files in
  `lib/l10n`. Build it with `just flutter build` and check it with
  `just flutter check`; see its README.
- `apps/tizen`: the Samsung TV app, a Preact web app packaged as a `.wgt`
  with the Flutter app's TV screens and Samsung's AVPlay for video. It
  runs from file paths on Chromium 56 and up, so it imports only types
  from `@matinee/contracts`, plus `@matinee/contracts/paths`, and the
  server answers CORS for `Origin: file://`. Its shared words come from
  the Flutter app's ARB files through `pnpm --filter @matinee/tizen
  strings`; `pnpm verify` checks them. Nobody has run it on a TV yet.
- `tools/release`: the scripts behind `just tag` and
  `.github/workflows/release.yml`, in `.mjs` on Node's own modules, since
  the workflow runs them before any install. Workflow steps and `just`
  recipes call a script there rather than hold shell of their own.
- `nix/`: the flake's package (`package.nix`) and NixOS module
  (`module.nix`), with tests in `nix/tests`. A server variable the module
  should set for people gets a typed option there; any other goes through
  the module's `settings`, and a secret through `secrets`.

## Development

- Use Node 24 and pnpm 11, not npm, Yarn, or Bun. `nix develop` provides
  both plus a repo-local Postgres.
- Run `pnpm verify` before finishing a change. CI runs the same checks plus
  `pnpm audit` and the web build.
- Lint is type-aware oxlint plus the anti-slop rules in `tools/oxlint`
  (borrowed from alloy). In practice:
  - Parse untrusted values (search params, JSON columns, provider payloads,
    error causes) with a `t` schema. `typeof` checks are rejected.
  - A parameter typed `unknown` must be named `cause`, and only for errors.
  - Use `satisfies` or a `Map` rather than annotating a literal as a
    `Record`.
  - Every `as` cast needs a `// SAFETY:` comment on its statement saying
    what makes it true. Prefer removing the cast.
  - Request-path library, title, and file reads need an access filter, or an
    `// ACCESS:` comment explaining the visible row they derive from.
  - Fix the code before reaching for a disable comment.
- Every part has the version in the root `package.json`. Don't set one
  anywhere else; `just tag <version>` changes it and releases (see Release
  below).
- The server and the web app have no automated tests yet, so check their
  flows by hand in the browser. The Flutter app's Dart tests run in
  `just flutter check`; check its screens by eye as well.
- Generate migrations with a descriptive snake_case name:
  `pnpm db:generate --name watch_progress`. Never edit a migration after it
  ships in a release; add a new one. Unreleased migrations may be consolidated
  before the next release.
- Add shadcn components from `packages/ui`:
  `pnpm dlx shadcn@latest add <name>`. The CLI's output is ours to edit.

## Release

- `just tag 0.2.0` bumps the root `package.json`, commits
  `chore: release v0.2.0`, tags it, and pushes. It needs a clean `main`
  that matches `origin/main`.
- Keep minor and patch under 100. The Android version code is
  `major * 10000 + minor * 100 + patch`, 9 for 0.0.9 and 10203 for
  1.2.3, and every APK of a release has it, the universal one and each
  ABI's alike, so they update each other. Flutter's split builds would
  add 1000, 2000, or 4000 for armeabi-v7a, arm64-v8a, or x86_64;
  `force-version-code-ignoring-abi` in
  `apps/flutter/android/gradle.properties` turns that off.
- The tag runs `.github/workflows/release.yml`: it checks the tag against
  `package.json`, runs `nix flake check`, pushes to Cachix, runs the
  Flutter app's JVM tests, and builds and signs the APKs with
  `tools/release/apk.mjs`. That checks each one's application id
  (`io.github.zekurio.matinee`), version code, and signer, and the
  workflow drafts a GitHub release with one APK per ABI (arm64-v8a,
  armeabi-v7a, x86_64), a universal one, and `checksums.txt`. The maintainer tries the APKs on a
  phone and a TV before publishing the draft.
- The workflow needs `CACHIX_AUTH_TOKEN` and a `release` environment with
  `ANDROID_KEYSTORE_BASE64` (`base64 -w0 matinee.jks`),
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and
  `ANDROID_KEY_PASSWORD`. Android only installs updates signed with the
  same key, so never rotate or regenerate the keystore.

## Web app

- Forms use TanStack Form through `useAppForm` from `src/lib/form.tsx`.
  Fields validate with the contract's `t` schemas.
- State that belongs together, or that several components share, lives in
  a zustand store in `src/stores/`. A store for something that can mount
  twice at once is per instance. Server data stays in TanStack Query, and
  URL state in search params.
- An effect only syncs with something outside React: the DOM, the media
  element, hls.js, timers, storage, subscriptions. Compute derived values
  in render, reset on a prop change with `key`, and do an event's work in
  its handler.
- Font sizes come from the theme (`text-xs`, `text-13px`, `text-sm`, ...),
  each with a line height of even whole pixels, which keeps text centered
  on the icons beside it. Lint rejects an arbitrary `text-[13px]`; add a
  `--text-*` size to `globals.css` when none fits.
- Text the user reads goes through `tr("area.key", params)` from `@/i18n`,
  with the message added to its area in `src/i18n/locales/en/` first and
  translated in the other languages' folders (see `apps/web/README.md`,
  Translations).
  Use `trRich` when a placeholder holds an element, a `plural(...)`
  message for a count, and `Intl.ListFormat` through `perLocale` for a
  list. A component in `packages/ui` reads `uiText()` instead. Call `tr`
  while rendering, never at module scope. A language switch remounts the
  app so every call runs again, but a value built at import keeps its old
  language. Format dates and numbers with `lib/format.ts`, or with
  `perLocale` from `@/i18n` for a new `Intl` formatter, never a hardcoded
  locale. When you change a user-facing message in the server or a
  contract schema, change its copy in `locales/en/server.ts` or
  `validation.ts` too, and its translations. Run `pnpm strings:dart` after
  editing these catalogs to update the Flutter app.

## Background work

- Work that runs outside a request, or that requests must not repeat at
  once, goes through a queue from `defineQueue` in `src/jobs/queue.ts`:
  keyed jobs, per-queue concurrency, priority, and failure memory. Don't
  write another `inflight` map or limiter for it. Add the queue's id to
  `JOB_QUEUE_IDS` in `packages/contracts/src/jobs.ts`.
- Periodic work is a task in `src/jobs/tasks.ts`, not a `setInterval`.
  Tasks find work and queue it; the scheduler stores their last run.
- A job never waits on another job of its own queue; that can deadlock.

## Live updates

- A procedure that pushes changes outputs `eventIterator(...)` in the
  contract. Over REST that's server-sent events, so it can stay a GET.
- The server side publishes a topic from `src/realtime/events.ts` where
  the state changes. Add new topics to `Topics` there. To stream the
  state again on each change, return `follow(...)` from
  `src/realtime/follow.ts`. To pass the events themselves on, use
  `events.subscribe(topic, { signal: streamSignal(signal) })`. Every
  stream ends on `streamSignal`, which also caps its length so the
  session gets checked again.
- The web app reads one with
  `useQuery({ ...orpc.x.experimental_liveOptions(), ...liveQuery })`
  (`liveQuery` from `src/lib/rpc.ts`), which reconnects. A stream from
  `follow` starts with the current state, so nothing is lost while it
  reconnects. A stream of events needs its own way to catch up.

## Boundaries

- Clients talk to the server only through the contract or the routes in
  `paths.ts`. Don't import server code into clients.
- The server decides and a client shows the result, so every client
  behaves the same. The server works out what a file is called
  (`MediaItem.label`), how its streams read (`format`, `resolution`,
  `dynamicRange`, and `layout` on the item's `probe`), how it plays
  (`playback.start` and `playback.seek`), and what a download holds
  (`downloads.resolve`). A client's part is what only it can know: what
  its device plays, sent as a `PlaybackDevice`, the words in its own
  language, and noticing that a source failed. It doesn't parse
  `relativePath`, pick tracks, choose between the file, a stream, and an
  encode, or build a `DownloadSpec` from rules of its own. When a client
  needs something the server doesn't send, add it to the contract rather
  than work it out in the client. A client that can't import
  `@matinee/contracts` reads the lists it offers, like the qualities and
  the skip steps, from `playback.options` and doesn't retype them. The one
  exception is a download playing offline, which picks its tracks in the
  Flutter app's `lib/downloads/download_tracks.dart` because there's no
  server to ask.
- A procedure behind a sign-in names the permission it takes in the
  contract, as the second argument of `get`, `post`, and the rest, from
  `PERMISSIONS` in `packages/contracts/src/permissions.ts`. `authed` in
  `rpc/base.ts` holds the account and its API token to it. Don't check
  `role` in a handler; ask `can(viewer, permission)` from
  `access/viewer.ts`, and gate a screen with `can(user, permission)` from
  the web app's `lib/permissions.ts`. Code that changes who holds a
  permission calls `requireOwn`, so nobody grants what they lack.
- Validate inputs in the contract schemas. Procedures throw `ORPCError` with a
  message the user can act on; anything 500 is logged and hidden.
- The server fetches only image URLs a metadata provider returned, stored in
  the `artwork` table, and the `picture` claim the OIDC provider signed or
  sent from userinfo. Never fetch a URL a client sent.
- Passkeys and OIDC redirects bind to `PUBLIC_URL`. Never derive origins from
  request headers.
- Auth cookies are HttpOnly and SameSite=Lax. Keep RPC on same-origin JSON
  POSTs so the CSRF reasoning in `app.ts` holds. In REST, only reads may be
  GET, since a cross-site link sends the cookie with a GET.
- The REST API can't send null in a query string, so a read whose input
  takes null is a POST, like `titles.items`. A new shared model goes in
  `commonSchemas` in `apps/server/src/rpc/openapi.ts`, so generated clients
  get a named type for it.
