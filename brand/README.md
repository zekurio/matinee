# Brand

The Matinee mark is an afternoon sun going down behind its horizon bands. It
has its own colors and never takes the theme's or the server's accent, so it
looks the same on every server.

The wordmark is "matinee" in lowercase, set in
[Unbounded](https://github.com/googlefonts/unbounded) Bold and tracked in by
2% of the em. Its round, single-story a echoes the sun. `wordmark.py` turns
the glyphs into outlines, so no file that shows it needs the font. In the
logo, the mark stands on the word's baseline and is as tall as the word,
with a gap of 30% of its width.

## Files

| File                     | What it is                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `mark.svg`               | The mark alone. Picks its colors from the viewer's light or dark scheme.                       |
| `wordmark.svg`           | The wordmark alone, dark on light and light on dark.                                           |
| `logo.svg`               | The mark and the wordmark. Picks its colors like `mark.svg`.                                   |
| `logo-light.svg`         | The logo in fixed colors for light backgrounds.                                                |
| `logo-dark.svg`          | The logo in fixed colors for dark backgrounds. The README shows one of the two.                |
| `social-preview.png`     | GitHub's social preview, 1280 by 640. Upload it under the repository's Settings.               |
| `app-icon.svg`           | The app icon, 1024 square and full bleed. Each platform rounds the corners.                    |
| `app-icon-dark.svg`      | iOS dark appearance. The mark on transparency.                                                 |
| `app-icon-tinted.svg`    | iOS tinted appearance. The mark in grays on transparency.                                      |
| `ios/AppIcon.appiconset` | Drop into an Xcode asset catalog. One 1024 image per appearance.                               |
| `android/res`            | Android adaptive icon and themed layer, used directly by the app's Gradle resource source set. |
| `android/play-store.png` | The 512 icon for the Play Console listing.                                                     |
| `wordmark.py`            | Draws the wordmark and writes the wordmark and logo files, the web's and Android's included.   |
| `render.sh`              | Runs `wordmark.py`, then renders every PNG here and the web app's icons from the SVGs.         |

The web app serves copies, `apps/web/public/favicon.svg` and
`apple-touch-icon.png`. `apps/web/src/components/brand.tsx` draws the mark
inline from the same path, and the logo from `logo.gen.ts`, which
`wordmark.py` writes. It also writes the Android app's logo drawables,
`logo.xml` and `logo_dark.xml` in `apps/android/app/src/main/res/drawable`.

## Colors

The sunset runs top to bottom through three stops. On dark backgrounds use
`#ffc56b`, `#f27a8f`, `#6d8cf5`. On light ones use the deeper `#f59f00`,
`#e64980`, `#3b5bdb`, or the top of the sun fades into white. The web app has
these as `--logo-sun`, `--logo-dusk` and `--logo-horizon` in
`packages/ui/src/styles/globals.css`. The app icon's sky goes from `#1d1a33`
to `#0e0e10`. The wordmark is `#18181b` on light and `#fafafa` on dark, or
the text color where the app draws it.

## Geometry

The mark sits on a 24 unit grid. The sun is a circle of radius 10 centered at
12,13. Gaps at y 15.1 to 16.2 and 17.8 to 19.2 cut it into a cap and two
slices, and it ends at 20.7. That leaves a bounding box from 2.22,3 to
21.78,20.7, and every placement below centers that box.

- iOS: 30 px to the unit on the 1024 canvas, so the mark is 587 px wide.
- Android: 2.2 dp to the unit on the 108 dp canvas. The farthest point lands
  24 dp from the center, inside the 33 dp safe zone, so no launcher mask
  touches it.

## Changing it

The wordmark's font, weight, tracking, and spacing in the logo are
constants at the top of `wordmark.py`. It downloads Unbounded from a pinned
commit of google/fonts once, checks its hash, and keeps it in
`~/.cache/matinee-brand`.

Edit the SVGs, keep the path and stops in step across them, the Android
drawables, the app's `logo_mark.xml` and `logo_mark_dark.xml`, `brand.tsx`,
and `SUNSET` in `wordmark.py`, then run `brand/render.sh` (or `just brand`)
and commit what it writes. It needs `resvg`, `oxipng`, and Python with
fontTools and uharfbuzz, and fetches them through Nix when they're missing.

Android only gets the adaptive icon, which needs API 26. An app that
supports older versions also needs PNG mipmaps for `ic_launcher`. Xcode 26's
Icon Composer can build a layered `.icon` from `app-icon-dark.svg` and the
sky. The asset catalog here still works without it.
