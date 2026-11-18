# Matinee

Self-hosted media server: Hono + oRPC server, React web client, Postgres.
README.md has the NixOS setup and the dev shell. Each app's README has the
rest: `apps/server/README.md` for configuration, auth, and how the server
behaves, `apps/web/README.md` for translations, `apps/android/README.md`
for building and sideloading the app.

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
- `brand/`: the logo, the wordmark, and the native app icons, with the
  scripts that draw the wordmark and render their PNGs, the web app's
  favicon, and `apps/web/src/components/logo.gen.ts`. See `brand/README.md`.
- `apps/android`: the native Android app (Kotlin, Compose, Media3), a
  Gradle project outside the pnpm workspace. Its API client,
  `api/ContractModels.kt` and `api/ContractApi.kt`, is generated from the
  OpenAPI document by `pnpm api:android`
  (`apps/server/scripts/kotlin-client.ts`). Run it after a contract change;
  `pnpm verify` fails while they're out of date. Screens build from
  `ui/kit`, its port of `packages/ui`; only the kit and `ui/theme` use
  Material components, and `KitBoundaryTest` holds that. Build the app with
  `nix develop .#android` or `just android build`; see its README.
- `apps/desktop`: the desktop app, which shows the server's web app in a
  window and plays with mpv. `native/` is the shell (C++, Qt 6 with Qt
  WebEngine, libmpv), a CMake project outside the pnpm workspace. `src/`
  is the app's own pages for picking a server and signing in, a Vite React
  app that CMake builds into the program. Build it with
  `nix develop .#desktop` or `just desktop build`; see its README.
- `packages/desktop-bridge`: what the desktop app's shell and the pages it
  shows say to each other. `src/protocol.ts` is the protocol, with a `t`
  schema for every method and event, and `connectDesktop()` the typed
  client. The shell's half is written by hand in
  `apps/desktop/native/src/app/application.cpp`, so a change has both.
- `tools/release`: the scripts behind `just tag` and
  `.github/workflows/release.yml`, in `.mjs` on Node's own modules, since
  the workflow runs them before any install. Workflow steps and `just`
  recipes call a script there rather than hold shell of their own.
- `nix/`: the flake's packages (`package.nix` for the server,
  `desktop.nix` for the desktop app, `mpv.nix` for its libmpv, patched
  to show video under another Wayland surface) and NixOS module
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
- No automated tests yet. Check affected flows by hand in the browser.
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
  `major * 10000 + minor * 100 + patch`.
- The tag runs `.github/workflows/release.yml`: it checks the tag against
  `package.json`, runs `nix flake check`, pushes the server and the
  desktop app to Cachix, builds and signs the APKs, and drafts a GitHub release with one APK per ABI, a
  universal one, and `checksums.txt`. The maintainer tries the APKs on a
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
- In the desktop app mpv plays instead of a `<video>`. `lib/desktop.ts` is
  the one place that asks for the shell, and `desktop` is null in a
  browser. The player's hooks take a `PlayerMedia` (`player-media.ts`),
  the part of a media element they use, which a `<video>` and `MpvMedia`
  both are. Keep new player code on that interface, and branch on the
  engine only where a browser and mpv differ in kind, as with hls.js and
  subtitles. The server's web app must keep working in a shell older than
  it is: add to the bridge rather than change it, or raise
  `BRIDGE_PROTOCOL`.
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
  `validation.ts` too, and its translations.

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
  exception is a download playing offline on Android, which picks its
  tracks in `DownloadTracks.kt` because there's no server to ask.
- The desktop app's pages never see a session's token. The shell keeps
  it, adds it to the requests the web app and mpv make to the server, and
  makes the sign-in requests itself. mpv only opens addresses on the
  server the app is connected to. A bridge method says which kind of page
  may call it, and the shell checks.
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
