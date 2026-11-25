# Matinee web app on Solid 2

A trial rewrite of `apps/web` on Solid 2.0, with ui-sdk for the components'
behavior and a desktop layout that follows the Flutter app. It runs beside
the React app against the same server. Nothing ships from here yet.

```sh
pnpm --filter @matinee/solid dev     # http://localhost:5174
pnpm --filter @matinee/solid dev     # then http://localhost:5174/tv/
```

The server and the React app come from `pnpm dev` as usual. Cookies go by
host, so a session from `localhost:5173` works here too. A passkey is bound
to `PUBLIC_URL`, so sign in on the React app, or run this one on its port
with `SOLID_PORT=5173`.

`/tv/` is the Matinee TV UI, the same screens the Samsung package runs,
from `@matinee/tv` in `packages/tv`. It is a document of its own, not a
route in the desktop shell, so its root size and theme don't mix with the
desktop app's Tailwind. It starts on the page's own origin and signs in
with the device code (or with the web app's cookie if one is there); a
Tizen package loaded by file path asks for the server's address instead.
The browser's video element plays; Samsung's AVPlay, the remote's media
keys, and the `.wgt` stay in `apps/tizen`.

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

## Shared source

`@/x` is this app's `src/x` when there is one and the React app's
`apps/web/src/x` otherwise. A file with no React in it, like `@/i18n`,
`@/lib/format` or `@/lib/permissions`, is shared as it is. A file that needs
porting is ported by writing it here under the same path.

Two things to know. A shared file that imports a neighbour by a relative
path, like `./rpc`, gets the React app's neighbour, so port it too. And the
build fails when anything reaches for `react`, `zustand`, `lucide-react`,
`sonner`, `@base-ui/react` or a `@tanstack/react-*` package, and names the
file that did.

When the React app goes, its shared files move here and the second path
comes out of `tsconfig.json` and `vite.config.ts`.

## Porting a React file

| React app                                    | Here                                                                                 |
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
| `@matinee/ui/components/x`                   | `@/kit/x`                                                                            |
| `toast` from `sonner`                        | `toast` from `@/kit/toast`                                                           |
| `trRich` from `@/i18n/react`                 | `trRich` from `@/i18n/solid`                                                         |

A component runs once. Props stay reactive only when read as `props.x` in
JSX, a memo or an effect, so don't destructure them, and don't read a signal
at the top of a component body. `tr()` is the exception: a language change
builds the app again, so call it anywhere a component runs.

The lint rules, the `tr()` catalog, the contract and the access rules in the
root `AGENTS.md` apply here as they do in the React app.

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

`src/kit` is this app's `packages/ui`: one file per component, with the
names and variants the React components have, so a ported screen changes
its imports and little else. ui-sdk supplies the behavior, and the classes
come from `packages/ui`. `/kit` shows every component on one page.
