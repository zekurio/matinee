# Writing a Matinee plugin

A plugin adds metadata, sign-in, or event handlers to a Matinee server.
An admin installs it and approves its permissions before it runs.
Installed code runs in QuickJS, in a sandbox, not in Node. It cannot read
files, environment variables, cookies, sessions, or the database.

## Start a package

`@matinee/plugin` isn't on npm yet. Until it is, write a plugin as a
folder under `plugins/` in the Matinee repository, as the four there are,
with `"@matinee/plugin": "workspace:*"` as its development dependency.

Create a package with `@matinee/plugin` as a development dependency.
Use TypeScript and put the entry in `src/index.ts`. Export one plugin as
the default export. Do not run setup at module scope.

```ts
import { definePlugin } from "@matinee/plugin"

export default definePlugin((ctx) => ({
  events: {
    "title.added": async ({ title }) => {
      ctx.log.info(`Added ${title.name}`)
    },
  },
}))
```

Use this `package.json` to build it:

```json
{
  "name": "matinee-plugin-title-log",
  "version": "1.0.0",
  "description": "Logs new titles.",
  "license": "MIT",
  "keywords": ["matinee-plugin"],
  "scripts": {
    "build": "matinee-plugin build",
    "pack": "matinee-plugin pack",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@matinee/plugin": "*",
    "typescript": "*"
  },
  "matinee": {
    "api": 1,
    "id": "title-log",
    "name": "Title log",
    "main": "dist/plugin.js",
    "contributes": { "events": ["title.added"] }
  }
}
```

Use `"lib": ["ES2023"]` and `"types": []` in your tsconfig. Add
`/// <reference types="@matinee/plugin/globals" />` at the top of your entry
file to load the guest global declarations without runtime code. A type-only
`import type {} from "@matinee/plugin/globals"` also works, but Matinee's
lint rules reject empty import blocks. Host code can import SDK types without
changing Node globals. Adding DOM or Node types would
hide mistakes such as calling `process.env` or opening a socket.

## Manifest reference

The host reads `package.json` without executing any code. npm fields may
have extra keys. The `matinee` object may not.

- `api` is the host API version, currently `1`. Other versions show as incompatible.
- `id` is 2 to 32 characters, starting with a lowercase letter, then
  lowercase letters, digits, or hyphens. `tmdb`, `tvdb`, `imdb`, `oidc`,
  `passkey`, and `matinee` are reserved.
- `name` is the display name, at most 64 characters. Names on contributions
  have the same limit. Descriptions and labels have at most 300 characters.
- `main` names the bundled module inside the package. It must be relative,
  without `..`, backslashes, or absolute paths. The bundle is at most 5 MB
  and cannot contain imports.
- `source` optionally changes the build entry from `src/index.ts`.
- `permissions.network` lists at most 32 host patterns, such as
  `api.example.com` or `*.example.com`. A wildcard matches any depth of
  subdomain but not `example.com` itself. Hosts are case-insensitive.
  No IPs, ports, schemes, localhost, or single-label names are accepted.
  These permissions allow only public https hosts on port 443.
- `permissions.storage` allows private JSON storage, default false.
- `contributes.metadata` lists `{ id, name, description, kinds, episodes }`.
  `kinds` contains `movie`, `show`, or both. Metadata ids are global and
  cannot use reserved ids. Only one enabled plugin can own an id.
- `contributes.auth` lists `{ id, name, kind }`. `kind` is `redirect` or
  `credentials`. Credentials providers also need `fields`, 1 to 4 objects
  with `key`, `label`, and `type`, either `text` or `password`.
  The host addresses auth providers as `<pluginId>.<providerId>`.
- `contributes.events` lists names from the catalog below, not arbitrary strings.
- `config` lists at most 32 fields. Keys start with a letter, followed by
  letters, digits, or underscores, at most 32 characters total. Keys must
  be unique. Every field needs `key`, `type`, and `label`. It may have
  `description`, `required`, and a typed `default`.

Config types are `string`, `secret`, `url`, `boolean`, `number`, and
`select`. Numbers may have `min` and `max`. A select needs `options` as
`{ value, label }[]`, and its default must be one of those values.
A missing required value puts a plugin in `needs-config`, and so does a
saved value your new version no longer takes, like an option an update
dropped. Secret values reach the plugin but never come back in the admin
API.

A `url` config field may set `network: true`. The host then permits
exactly the host, port, and scheme the admin enters, including http and
private addresses. Use this for a self-hosted service, never to bypass
the static host list with a URL obtained from an external service.

A sign-in plugin's subjects only mean something at one provider. If an
admin changes one of your `network: true` addresses while accounts are
linked, the host asks them whether the links still hold. Set
`"identity": true` on any other setting that decides who a subject is,
like the name of the field you read the subject from, so the host asks
for those too.

```json
{
  "key": "server",
  "type": "url",
  "label": "Server address",
  "required": true,
  "network": true
}
```

An admin sees network hosts, network config labels, storage, metadata
providers, sign-in providers, credentials access, and subscribed event
groups before approval. Credentials and playback activity are sensitive.
Changing files or requesting more permissions stops the plugin until the
admin approves it again.

## Context and helpers

The sandbox stops when idle and starts again for the next call. `setup`
runs on each start, so keep it cheap. Variables may survive nearby calls,
but anything kept in a variable can be gone by the next call. Use
`ctx.storage` for state that must survive sleeping or a server restart.
The host keeps a redirect sign-in's returned `session` across sleeps.

The setup function receives `PluginContext`:

- `plugin` has your id and version.
- `server` has the Matinee version, API number, and public URL.
- `config` has readonly strings, numbers, booleans, or null, including secrets.
- `log.debug/info/warn/error(message, detail?)` writes to the plugin log.
  Never log credentials, tokens, or secrets.
- `storage.get/set/delete/keys` stores JSON for this plugin only. `get`
  returns null for a missing key. `keys(prefix?)` lists keys by prefix.
  `storage.update(key, change)` reads a value, passes it to `change`, and
  stores what that returns, as one step. Use it for a counter or a list:
  several handlers run at once, and a `get` followed by a `set` can lose
  another handler's write.
- `crypto` has `randomUUID`, `randomBytes`, `sha256`, and `hmacSha256`.
  Digests return bytes. Use `hex` or `base64Url` to encode them.

`fetchJson(url, init?)` sends JSON bodies and returns JSON. It retries 429
and 5xx responses up to three times with backoff and `Retry-After`.
Each retry delay is capped at 60 seconds. The host's call deadline still
applies, so a long `Retry-After` can time out the handler before the next
attempt. Network errors are not retried. It throws `ProviderError` with
an HTTP status for other failed responses. Validate remote data before
using it. `fetchJson` does not make untrusted JSON into a typed result,
and does not detect GraphQL errors inside HTTP 200 responses.

`ProviderError(message, status?)` is also useful in auth handlers. Its
message can be shown to the person signing in. Other errors get a generic
message. Do not put secrets in an error message.

## Metadata

Declare the id in `contributes.metadata` and return the same key under
`metadata`. `search` and `details` are required. `lookup` can translate ids
from other providers. `images` can list artwork for a title, season, or
episode. Images must be https URLs covered by the network grant.

This small provider has one title and no remote images:

```ts
import { definePlugin, type TitleDetails } from "@matinee/plugin"

const title: TitleDetails = {
  id: "1",
  name: "Example",
  originalName: null,
  originalLanguage: "en",
  year: 2025,
  overview: "An example title.",
  tagline: null,
  genres: [],
  rating: null,
  contentRating: null,
  releaseDate: null,
  status: null,
  runtimeMinutes: null,
  externalIds: { sample: "1" },
  images: { poster: null, backdrop: null, logo: null },
  studios: [],
  credits: [],
  seasons: [],
  episodes: [],
}
export default definePlugin(() => ({
  metadata: {
    sample: {
      async search(query) {
        return title.name.toLowerCase().includes(query.name.toLowerCase())
          ? [
              {
                id: "1",
                name: title.name,
                aliases: [],
                year: title.year,
                overview: title.overview,
                poster: null,
              },
            ]
          : []
      },
      async details() {
        return title
      },
      async lookup(ids) {
        return ids.sample ?? null
      },
      async images() {
        return []
      },
    },
  },
}))
```

Declare `sample` with `kinds: ["movie"]` and `episodes: false` in its
manifest. Dates use YYYY-MM-DD. Languages use BCP 47 tags. Missing values
are null, not empty strings. Keep cast in billing order before crew.
The host validates at most 50 candidates, 100 seasons, 10,000 episodes,
500 credits, 500 images, and 16 external ids per result.

## Redirect sign-in

Declare a `redirect` auth contribution. Its start URL must be covered by
the network grant. The host supplies state, stores session data, and checks
state itself before calling finish. Never return a local user id or role.
Return the provider's stable subject.

```ts
import { definePlugin, ProviderError } from "@matinee/plugin"

export default definePlugin((ctx) => ({
  auth: {
    example: {
      async start({ redirectUri, state }) {
        const url = new URL("https://login.example.com/authorize")
        url.searchParams.set("client_id", String(ctx.config.clientId))
        url.searchParams.set("redirect_uri", redirectUri)
        url.searchParams.set("state", state)
        url.searchParams.set("response_type", "code")
        return { url: url.href }
      },
      async finish({ query, redirectUri }) {
        const body = new URLSearchParams({
          code: query.code ?? "",
          redirect_uri: redirectUri,
          client_id: String(ctx.config.clientId),
          client_secret: String(ctx.config.clientSecret),
        })
        const response = await fetch("https://login.example.com/token", {
          method: "POST",
          body: body.toString(),
          headers: { "content-type": "application/x-www-form-urlencoded" },
        })
        if (!response.ok) throw new ProviderError("Sign-in was refused.")
        // This example service returns its subject as plain text.
        const subject = await response.text()
        if (!subject || subject.length > 256)
          throw new ProviderError("No account was returned.")
        return { subject }
      },
    },
  },
}))
```

A real OAuth provider usually returns JSON tokens. Exchange its code,
then obtain the subject from its documented user endpoint. Declare each
host and config field you use. `session` is optional JSON for values such
as a PKCE verifier. The host keeps it for the callback, not the plugin.

## Credentials sign-in

Declare a credentials provider with fields matching the keys you read.
This example service returns a stable subject as plain text:

```ts
import { definePlugin } from "@matinee/plugin"

export default definePlugin((ctx) => ({
  auth: {
    example: {
      async authenticate({ fields }) {
        const response = await fetch(
          new URL("/login", String(ctx.config.server)),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(fields),
          },
        )
        if (response.status === 401) return null
        if (!response.ok) throw new Error("The sign-in service is unavailable.")
        const subject = await response.text()
        if (!subject || subject.length > 256) return null
        return { subject, username: fields.username }
      },
    },
  },
}))
```

Declare `username` as `text` and `password` as `password`. Use a network
URL config field for `server`. The host rate-limits attempts and decides
whether sign-up is allowed. A matching username never links an existing
account silently. People can link providers while signed in.

## Events and shutdown

The catalog is fixed:

- `library.scanned` has `library`, `added`, and `removed`.
- `title.added` has `title`.
- `title.matched` has `title`, `provider`, and `providerId`.
- `playback.started` has `user`, `title`, `item`, and `positionSeconds`.
- `playback.stopped` adds `durationSeconds`, which may be null.
- `playback.watched` has `user`, `title`, `item`, and `watched`.
- `user.created` has `user` with a `role` of `admin` or `user`.

A playback session that closes and is reported on again, as after a long
pause, starts again: expect `playback.started` and `playback.stopped` more
than once for one viewing, and two reports arriving at the same moment
can repeat an event. `title.matched` comes when a title gets a match or
a different one, not on every refresh.

See `PluginEvents`, `TitleRef`, `UserRef`, and `ItemRef` for exact fields.
Names are read at delivery time, so a renamed title arrives with its new
name. If a referenced title, item, library, or user is gone, the event is
dropped.

Handlers take `(event, meta)`. `meta.id` is a string that stays the same
on every try of that delivery. `meta.at` is the recording time in ISO 8601,
and `meta.attempt` starts at 1. Use the id to recognize repeats.

An event is stored in Postgres when it happens and delivered at least
once, across server restarts and crashes of your plugin. It is recorded
while your plugin is on, and also while it has failed and waits for a
restart. It is not recorded while your plugin is off or waits for
approval or settings.

Up to four of your event handlers run at once, taking turns at their
awaits. Events in one lane arrive in the order their changes were saved:
`library.scanned` is in its library's lane, `title.added` and
`title.matched` in their title's, and the playback events and
`user.created` in their user's. Events in different lanes can overtake
each other, so `library.scanned` can arrive before the last `title.added`
of that scan. A change that is slow to save can also arrive after a
later one in its lane. `meta.id` grows as events are recorded, and
`meta.at` is when; sort by them if order across lanes matters to you.

A handler has 30 seconds. One that throws or times out is tried again
after 5 seconds, 30 seconds, 2 minutes, 10 minutes, then every 30
minutes, and only its lane waits behind it. After a failure the host
sends one event at a time until one succeeds, an event that has not
failed before first. When those fail one after another, it takes your
other end for down and waits longer before each next try. One event
that keeps failing by itself doesn't slow the others. A timeout can repeat work
your handler already finished, and so can a sandbox that stopped while
your handler ran, so delivery is not exactly once: use `meta.id` to
recognize a repeat. An admin can have the waiting events tried at once
from your plugin's page, and saving your plugin's settings does the
same.

The host gives up on an event 24 hours after it was recorded, or when
more than 5000 wait for your plugin, oldest first, and logs how many it
dropped. Removing your plugin deletes its events. This is not an audit
log.

Several handlers at once means two can read the same stored value and
both write it back. Use `ctx.storage.update` for anything you read and
then write.

Return `dispose()` to release resources at shutdown. It has two seconds.

## Async and cancellation

Handlers are async. Up to 16 calls into your plugin run at once and take
turns at their awaits. They never run in parallel: your plugin is one
sandbox on one thread, and while your code computes, your other calls
wait, and so may other plugins on that thread. Do long work in pieces
with an await on a timer between them. An await on a promise that is
already resolved gives nobody a turn. One run without a pause may take
two seconds, and then the sandbox is ended.

Every call has a signal that aborts when the host stops waiting for it:
its time ran out, whoever asked went away, or your sandbox is being
stopped. An event handler finds it at `meta.signal`. Every other handler
gets one more argument at the end, `call`, with `call.signal`:
`search(query, call)`, `details(id, lookup, call)`,
`authenticate(input, call)`. Pass the signal to `fetch`, and call
`signal.throwIfAborted()` between pieces of work.

```ts
const response = await fetch(url, {
  signal: AbortSignal.any([call.signal, AbortSignal.timeout(10000)]),
})
```

A handler that goes on after its signal aborted does no harm to the
caller, since its result is dropped. But it keeps its place among your
16 calls until it ends, and a handler that hasn't ended 30 seconds after
its signal aborted gets the sandbox ended, which counts as a failure of
your plugin.

`AbortController`, `AbortSignal.abort`, `AbortSignal.any` and
`AbortSignal.timeout` work as on the web. A timeout takes 0 to 60000
milliseconds and is not one of your 100 timers. Abort reasons are errors
named `AbortError`, or `TimeoutError` for a timeout. Aborting a `fetch`
frees its place among your eight requests. `queueMicrotask(callback)`
runs after the current code, before any timer.

Sleeping discards signals, pending work, timers, and variables. Only
`ctx.storage` and what you returned to the host survive.

## Globals and limits

An idle sandbox is stopped, including its timers and variables. The next
call starts a fresh sandbox and runs `setup` again. Keep setup cheap, and
never rely on a variable surviving between calls. Persist state through
`ctx.storage`, not a timer or a module-level cache. The default idle wait
is 120 seconds; an admin can change it, and the awake-sandbox cap can
stop an idle sandbox sooner.

Awake plugins share one thread and take turns in it. A handler that
computes for long holds the others up, so do the work in pieces around
`await`s, and expect to be ended when one run without a pause passes two
seconds.

The guest has ES2023, `console`, `setTimeout`, `clearTimeout`, `fetch`,
`URL`, `URLSearchParams`, UTF-8 `TextEncoder` and `TextDecoder`, `atob`,
`btoa`, `AbortController`, `AbortSignal`, `queueMicrotask`, and
`crypto.randomUUID/getRandomValues`.

Fetch is buffered. Its response has `ok`, `status`, `statusText`, `url`,
`headers.get/entries`, `text`, `json`, and `arrayBuffer`. Input accepts
`method`, `signal`, string headers or header pairs, and a string or Uint8Array body.
There is no streaming, Request, FormData, DOM, process,
require, filesystem, sockets, or dynamic import. Bundle dependencies that
use only these globals. Global crypto has no `subtle`; use `ctx.crypto`.

Default limits:

| Resource                        | Limit                       |
| ------------------------------- | --------------------------- |
| Guest memory / stack            | 64 MB / 1 MB                |
| One synchronous run             | 2 seconds                   |
| One call / startup              | 30 seconds / 10 seconds     |
| Concurrent calls into the guest | 16                          |
| Boundary message                | 8 MB                        |
| Data in flight, each direction  | 32 MB                       |
| Concurrent HTTP requests        | 8                           |
| Request / response body         | 1 MB / 5 MB                 |
| Pending timers / longest timer  | 100 / 60 seconds            |
| Storage key / JSON value        | 128 characters / 64 KB      |
| Stored keys / total storage     | 1000 / 5 MB                 |
| Log history / line length       | 500 lines / 2000 characters |
| Log rate                        | 50 lines per second         |

## Build, pack, and install

Run `pnpm build`, then `pnpm pack` using the scripts above, or invoke
`matinee-plugin build` and `matinee-plugin pack` directly. The CLI bundles
for ES2022 as one ES module, checks its size, and prints the permissions
an admin will approve. Pack runs build and writes `<id>-<version>.tgz`.
It contains only `package.json`, the main file, and top-level README and
LICENSE files. It does not include dependencies or source files.

Publish the npm package with the `matinee-plugin` keyword to make it
searchable. An admin can install by npm name, `name@version`, `name@tag`,
or a public https URL to the `.tgz`. They inspect the package, review the
permissions, then approve installation and optionally enable it.

For a local install, copy the built folder into
`$MATINEE_DATA_DIR/plugins/<id>/`. Keep `package.json` and the main file at
its declared path. An operator can also set `MATINEE_PLUGIN_DIRS` to a
colon-separated list of directories holding plugin folders. Rescan in the
admin page after adding one. New folders start disabled and need approval.
The server never installs dependencies or runs npm lifecycle scripts.

## Try a handler in this repository

Build the plugin first, then run it in the real QuickJS sandbox:

```sh
nix develop -c pnpm --filter @matinee/server exec tsx scripts/plugin-try.ts \
  ../../plugins/anilist metadata.anilist.search \
  '{"kind":"show","language":"en","name":"Frieren","year":2023}'
```

Pass each handler argument as a separate JSON value. Use `--list` instead
of a handler path to list handlers, and repeat `--config key=value` to
supply settings. Booleans use `true` or `false`; other text is literal.
The tool applies manifest defaults and network permissions. Storage is
in memory and disappears when it exits. Logs and handler names go to
stderr; the result goes to stdout. Config secrets passed on the command
line can appear in shell history and process listings; use test credentials.
