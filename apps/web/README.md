# Matinee web

The browser client: React with Vite, TanStack Router and Query, and the
shadcn components from `packages/ui`. It talks to the server only through
the typed client from `packages/client` and the plain routes in
`packages/contracts/src/paths.ts`. In production the server serves its
build, so there is nothing to deploy on its own.

## Running it

From the repository root, inside `nix develop`:

```sh
pnpm dev          # server on :8420 and this app on :5173
pnpm dev:web      # this app alone, against a server that's already up
```

Vite proxies `/api` to `http://localhost:8420`, or to `VITE_SERVER_URL`
when it's set, so the browser stays on one origin and cookies work as in
production. Keep `PUBLIC_URL` on the Vite address, `http://localhost:5173`,
since passkeys and OIDC redirects bind to it.

`pnpm build` writes `dist/`, with Brotli and gzip copies of each text file
for the server to send. Point `MATINEE_WEB_DIST` at it.

## Where things are

- `src/routes`: file routes. `src/routeTree.gen.ts` is generated, so don't
  edit it.
- `src/components`: pages and the pieces they share. `brand.tsx` draws the
  logo from `logo.gen.ts`, which `brand/render.sh` writes.
- `src/stores`: zustand stores for state that several components share.
  Server data stays in TanStack Query and URL state in search params.
- `src/lib`: the RPC client, forms (`form.tsx`), formatting, and what the
  browser can play.
- `src/i18n`: the message catalogs, below.

`AGENTS.md` at the repository root has the conventions for forms, effects,
stores, and text.

## Subtitles

The player advertises WebVTT, PGS and ASS rendering to the server. ASS/SSA
scripts render as authored through a lazy-loaded JASSUB worker, with fonts
from the media item's Matroska attachments and a bundled Liberation Sans
fallback. Nothing loads from a CDN. Rendering is capped at 1080 pixels high;
ordinary video picture-in-picture cannot include this canvas overlay.
WebVTT appearance and control-avoidance positioning do not override ASS
styles. A renderer failure requests the same track again with ASS support
removed for that player session, so the server delivers WebVTT instead.
Downloads continue to use their existing subtitle formats.

## Translations

The web app's text lives in catalogs under `apps/web/src/i18n/locales/`,
one folder per language and one file per area of the app (`player.ts`,
`stats.ts`, and so on). `en/` is the source and holds every message. Each
other folder is a language, named by its BCP 47 tag (`de/`, `pt-BR/`), and
loads only when picked. Settings → Appearance → Language picks one per
device, and by default the app follows the browser's languages. Dates,
numbers, language names, and the calendar follow the pick.

To add a language, copy `de/` to `<tag>/` and translate the values.
Nothing else needs changing: the picker lists the folder under the
language's own name. Keys left out show the English text, so a
translation can ship partial. The types reject unknown keys, a dropped
`{placeholder}`, and a plain string where English has a `plural(...)`.
A plural lists the forms its language has, as `Intl.PluralRules` names
them: English has `one` and `other`, Polish also has `few` and `many`.

The shared components in `packages/ui` can't reach the catalog. The app
hands them their text (the `ui` area) through `setUiText` from
`@matinee/ui/lib/ui-text`.

The server's error messages and the contract schemas' validation
messages arrive in English. The `server` and `validation` areas copy them
word for word, and `translateKnown()` matches what arrives against those
copies, with `{name}` standing for a value. A message changed on the
server needs the same change in `en/server.ts` (or `en/validation.ts`),
or it shows in English. Metadata from providers, such as overviews,
genres, and statuses, shows as the provider sent it.
