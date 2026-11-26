# `@matinee/tv`

The TV UI both TV entries run: the Solid 2 screens, the remote's focus and
navigation, the session and API reads, the i18n, and the player controller.
It is not a server or a desktop component; it has no build of its own and
imports no `@matinee/ui` and no Samsung API.

```ts
import "@matinee/tv/styles"
import { mountTv, type Platform } from "@matinee/tv"

const root = document.getElementById("app")
if (root) mountTv(root, platform)
```

| Host                  | `Platform`                                             |
| --------------------- | ------------------------------------------------------ |
| `apps/web` at `/tv/`  | `browserPlatform`: video element, page's own origin    |
| `apps/tizen` (`.wgt`) | `tizenPlatform`: AVPlay, Tizen keys, app version/model |

`Platform` is in `src/platform/runtime.ts`. It supplies the player engine,
the remote's media keys, exit and screen-saver calls, the panel and HDR
facts, the device platform, the app version, and the server a web page
should start on. Everything else is shared, so a screen changed here
changes in both entries.

The Flutter app's TV screens are the other TV UI. This package began as
their port and has fewer of them. Neither is the reference yet, so a TV
change goes to both (see Clients in the root `AGENTS.md`).

## Strings

`src/i18n/shared.gen.ts` is generated from the Flutter app's ARB files for
the keys this package names. Don't edit it; change the message in
`apps/flutter/lib/l10n`, or the key here, and run:

```sh
pnpm --filter @matinee/tv strings
```

`src/i18n/own.ts` holds the few strings only the TV UI has. `pnpm verify`
runs the check too.

## Build and check

There is no package build: Vite compiles the source in its consumer, with
the Solid compiler. `apps/tizen` runs it through `@vitejs/plugin-legacy` for
Chromium 56; `apps/web` builds it as the modern `/tv/` document.

```sh
pnpm --filter @matinee/tv typecheck
pnpm --filter @matinee/tv strings --check
```

The screens are checked by eye in the browser and in the packaged
`file://` app; the Tizen README lists what still needs a TV.
