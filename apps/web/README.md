# Matinee web

The browser client. React, Vite, TanStack Router and Query, and the
components from `packages/ui`. It talks to the server only through
`packages/client` and the routes in `packages/contracts/src/paths.ts`. The
server serves the build, so there's nothing to deploy separately.

## Running it

From the repository root, inside `nix develop`:

```sh
pnpm dev          # server on :8420 and this app on :5173
pnpm dev:web      # this app alone, against a running server
```

Vite proxies `/api` to `http://localhost:8420`, or to `VITE_SERVER_URL` if
set, so cookies work like in production. Keep `PUBLIC_URL` at
`http://localhost:5173`, because passkeys and OIDC redirects bind to it.

`pnpm build` writes `dist/` with Brotli and gzip copies of each text file.
Point `MATINEE_WEB_DIST` at it.

## Layout

- `src/routes`: file routes. Don't edit the generated `src/routeTree.gen.ts`.
- `src/components`: pages and shared pieces. `brand.tsx` draws the logo
  from `logo.gen.ts`, which `brand/render.sh` writes.
- `src/stores`: zustand stores for shared state.
- `src/lib`: the RPC client, forms, formatting, and codec support checks.
- `src/i18n`: message catalogs.

## Subtitles

The player tells the server it can render WebVTT, PGS, and ASS. ASS/SSA
renders through JASSUB in a worker that loads only when needed. Fonts come
from the file's Matroska attachments, with Liberation Sans bundled as a
fallback. Nothing loads from a CDN.

ASS rendering is capped at 1080p, and picture-in-picture can't show it.
WebVTT styling and control avoidance don't apply to ASS. If the renderer
fails, the player asks for the same track again without ASS support, and
the server sends WebVTT.

## Translations

Catalogs live in `src/i18n/locales/`, one folder per language and one file
per area (`player.ts`, `stats.ts`). `en/` is the source. Other folders are
named by BCP 47 tag (`de/`, `pt-BR/`) and load only when picked. Users pick
a language in Settings → Appearance. The default follows the browser.

To add a language, copy `de/` to `<tag>/` and translate the values. The
picker finds it automatically. Missing keys fall back to English, so
partial translations are fine. The types reject unknown keys, dropped
`{placeholders}`, and plain strings where English uses `plural(...)`. A
plural lists the forms its language has, as `Intl.PluralRules` names them.
English has `one` and `other`. Polish adds `few` and `many`.

`packages/ui` can't import the catalog. The app passes its text, the `ui`
area, through `setUiText` from `@matinee/ui/lib/ui-text`.

Server errors and validation messages arrive in English. The `server` and
`validation` areas copy them word for word, and `translateKnown()` matches
incoming text against them, with `{name}` for values. If you change a
message on the server, change `en/server.ts` or `en/validation.ts` too, or
it stays in English. Provider metadata like overviews and genres shows as
the provider sent it.
