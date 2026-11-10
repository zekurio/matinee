# Brand

The Matinee mark is an afternoon sun going down behind its horizon bands. It
has its own colors and never takes the theme's or the server's accent, so it
looks the same on every server.

## Files

| File                     | What it is                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `mark.svg`               | The mark alone. Picks its colors from the viewer's light or dark scheme.                       |
| `app-icon.svg`           | The app icon, 1024 square and full bleed. Each platform rounds the corners.                    |
| `app-icon-dark.svg`      | iOS dark appearance. The mark on transparency.                                                 |
| `app-icon-tinted.svg`    | iOS tinted appearance. The mark in grays on transparency.                                      |
| `ios/AppIcon.appiconset` | Drop into an Xcode asset catalog. One 1024 image per appearance.                               |
| `android/res`            | Android adaptive icon and themed layer, used directly by the app's Gradle resource source set. |
| `android/play-store.png` | The 512 icon for the Play Console listing.                                                     |
| `render.sh`              | Renders every PNG here and the web app's icons from the SVGs.                                  |

The web app serves copies, `apps/web/public/favicon.svg` and
`apple-touch-icon.png`. `apps/web/src/components/brand.tsx` draws the mark
inline from the same path.

## Colors

The sunset runs top to bottom through three stops. On dark backgrounds use
`#ffc56b`, `#f27a8f`, `#6d8cf5`. On light ones use the deeper `#f59f00`,
`#e64980`, `#3b5bdb`, or the top of the sun fades into white. The web app has
these as `--logo-sun`, `--logo-dusk` and `--logo-horizon` in
`packages/ui/src/styles/globals.css`. The app icon's sky goes from `#1d1a33`
to `#0e0e10`.

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

Edit the SVGs, keep the path and stops in step across them, the Android
drawables, the app's `logo_mark.xml` and `logo_mark_dark.xml`, and `brand.tsx`,
then run `brand/render.sh` and commit what it
writes. It needs `resvg` and `oxipng` and fetches both through Nix when
they aren't on the PATH.

Android only gets the adaptive icon, which needs API 26. An app that
supports older versions also needs PNG mipmaps for `ic_launcher`. Xcode 26's
Icon Composer can build a layered `.icon` from `app-icon-dark.svg` and the
sky. The asset catalog here still works without it.
