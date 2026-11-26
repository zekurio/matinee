# Matinee web

The browser client: Solid 2, ui-sdk, Vite, and TanStack Router and Query.
It's the reference for how each screen looks and behaves, at desktop and
phone width, and the Flutter app ports its changes (see Clients in the
root `AGENTS.md`). It talks to the server
only through `packages/client` and the routes in
`packages/contracts/src/paths.ts`. The server serves the build, so there's
nothing to deploy separately.

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
Point `MATINEE_WEB_DIST` at it. Build with `NODE_ENV=production`, since the
dev shell's `NODE_ENV` would bundle Solid's development runtime.

`/tv/` is the Matinee TV UI, the same screens the Samsung package runs,
from `@matinee/tv` in `packages/tv`. It is a document of its own, not a
route in the desktop shell, so its root size and theme don't mix with the
desktop app's Tailwind. It starts on the page's own origin and signs in
with the device code (or with the web app's cookie if one is there); a
Tizen package loaded by file path asks for the server's address instead.
The browser's video element plays; Samsung's AVPlay, the remote's media
keys, and the `.wgt` stay in `apps/tizen`.

On a couch PC the TV UI is TV mode, a switch in the account menu and in
Settings → Appearance. `stores/tv-mode.ts` keeps the flag it shares with
the TV document, and the desktop app's root goes to `/tv/` while it's on.
The TV's Settings → This computer and its sign-in screen show the same
switch, and turning it off there opens the desktop app.

## Layout

- `src/routes`: file routes. Don't edit the generated `src/routeTree.gen.ts`.
- `src/components`: pages and shared pieces. `brand.tsx` draws the logo
  from `logo.gen.ts`, which `brand/render.sh` writes.
- `src/kit`: the components, one file per component (see The kit below).
- `src/stores`: signals and stores for shared state.
- `src/lib`: the RPC client, forms, formatting, and codec support checks.
- `src/i18n`: message catalogs.
- `src/tv.tsx` and `tv/index.html`: the `/tv/` document.

## What it's built on

| Part       | Package                                                                     |
| ---------- | --------------------------------------------------------------------------- |
| Rendering  | `solid-js` and `@solidjs/web` 2.0, compiled by `@solidjs/vite-plugin`       |
| Routing    | `@tanstack/solid-router` 2.0 (release candidate), file routes               |
| Data       | `@tanstack/solid-query` 6.0 (release candidate) with `@orpc/tanstack-query` |
| Components | `@ui-sdk/solid` (beta) for behavior, styled in `src/kit`                    |
| Icons      | `lucide`, drawn by `src/kit/icon.tsx`                                       |
| Forms      | `createForm` in `src/lib/form.ts`, checked with the contract's `t` schemas  |
| Styles     | Tailwind 4 and the tokens in `packages/ui/src/styles/globals.css`           |

All of these are newer than a coding agent's training data. Before writing
code here, read what ships in `node_modules`:

- `solid-js/CHEATSHEET.md`, all of it. Solid 2 is not Solid 1, and neither
  is React.
- `@tanstack/solid-router/skills/solid-router/SKILL.md`.
- `@ui-sdk/solid/docs/llms.txt`, then the page of each component you use in
  `@ui-sdk/solid/docs/components/`.

## Coming from React

| React                                        | Here                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `className`, `htmlFor`, `tabIndex`           | `class`, `for`, `tabindex`                                                           |
| `useState`                                   | `createSignal`                                                                       |
| `useMemo`, values worked out while rendering | `createMemo`, or a plain function                                                    |
| `useEffect` that syncs with the DOM          | `createEffect(compute, apply)`, or `onSettled` with a cleanup for mount and unmount  |
| `useRef`                                     | a `let` and `ref={(el) => (node = el)}`                                              |
| `useQuery(options)`                          | `useQuery(() => options)`. Read `.data` under `<Loading>`, or branch on `.isPending` |
| `useMutation(options)`                       | `useMutation(() => options)`                                                         |
| a zustand store                              | signals or `createStore` in `src/stores`, with `persisted()` for `localStorage`      |
| `{cond && <A />}`, `cond ? <A /> : <B />`    | `<Show when={cond} fallback={<B />}>`                                                |
| `list.map((x) => <A key={x.id} />)`          | `<For each={list}>{(x) => <A />}</For>`                                              |
| `<Suspense>`, an error boundary              | `<Loading>`, `<Errored>`                                                             |
| `lucide-react`'s `<HouseIcon />`             | `<Icon icon={House} />` with `House` from `lucide`                                   |
| `toast` from `sonner`                        | `toast` from `@/kit/toast`                                                           |

A component runs once. Props stay reactive only when read as `props.x` in
JSX, a memo or an effect, so don't destructure them, and don't read a signal
at the top of a component body. `tr()` is the exception: a language change
builds the app again, so call it anywhere a component runs.

The lint rules, the `tr()` catalog, the contract and the access rules in the
root `AGENTS.md` apply here.

## Keeping it fast

Solid doesn't make a page fast by itself. Each of these cost more than
the framework saved until it was fixed, and each has a comment where the
fix is:

- A spread on an element (`<svg {...props}>`) makes Solid set every
  attribute with a call of its own, where it otherwise clones them with
  the element. Leave spreads off elements a page has hundreds of, like
  `Icon`.
- Solid sets attributes in the order they're written, so an `<img>` takes
  `loading`, `sizes` and `srcset` before `src`.
- A grid that can grow with the library goes in `WindowedGrid`
  (`components/windowed-grid.tsx`), which keeps only the rows near the
  window in the page. Its rows must be one height.
- A long list mounts from a signal that an effect copies the query's data
  into, not from `query.data`. See `TitleResults` in
  `components/library/title-grid.tsx`.
- What a card does when it mounts, it does again each time it scrolls
  back into a windowed grid. Keep what it worked out, as `blurhash.tsx`
  keeps decoded placeholders.
- Animate `scale`, `translate` and `opacity`, never `width` or `height`.
  A `backdrop-blur` on something a list repeats goes on only while it
  shows.
- A `<canvas>` gets a layer of its own in Chrome, and so does what's
  drawn over it. A placeholder a list repeats is an `<img>`.
- A lazy `<img sizes="auto">` picks a file again when it leaves the page,
  at the window's width. `Picture` clears its source once it's out.
- A screen that's dear to build and often come back to can be kept, as
  the shell keeps Home: out of the document while away, its queries off.
- Hover preloads go through `pointerIntent` (`lib/pointer-intent.ts`), so
  a card that scrolls under a resting pointer loads nothing.

Chrome's script time counter leaves out microtasks, which is where Solid
renders, so it reads low for this app. Measure from a trace.

## The kit

`src/kit` is this app's component library: one file per component, after
the shadcn components the app started with, so the names and variants are
familiar. ui-sdk supplies the behavior, the classes live in each file, and
the theme tokens come from `globals.css` in `packages/ui`. `/kit` shows
every component on one page.

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

The kit reads its own words, like a close button's label, through
`uiText()` from `@matinee/ui/lib/ui-text`. `src/lib/ui-text.ts` hands it
the `ui` area whenever the language changes.

Server errors and validation messages arrive in English. The `server` and
`validation` areas copy them word for word, and `translateKnown()` matches
incoming text against them, with `{name}` for values. If you change a
message on the server, change `en/server.ts` or `en/validation.ts` too, or
it stays in English. Provider metadata like overviews and genres shows as
the provider sent it.
