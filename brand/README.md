# Brand

The mark is a sun setting behind horizon bands. It has fixed colors and
never takes the theme or server accent.

The wordmark is "matinee" in lowercase,
[Unbounded](https://github.com/googlefonts/unbounded) Bold, tracked in by
2%. `wordmark.py` converts the glyphs to outlines, so nothing needs the
font installed. In the logo, the mark sits on the baseline at the word's
height, with a gap of 30% of its width.

## Files

| File                     | What it is                                                   |
| ------------------------ | ------------------------------------------------------------ |
| `mark.svg`               | The mark. Follows the viewer's light or dark scheme          |
| `wordmark.svg`           | The wordmark, dark on light and light on dark                |
| `logo.svg`               | Mark and wordmark. Follows the color scheme                  |
| `logo-light.svg`         | Fixed colors for light backgrounds                           |
| `logo-dark.svg`          | Fixed colors for dark backgrounds                            |
| `social-preview.png`     | GitHub social preview, 1280×640. Upload it in Settings       |
| `app-icon.svg`           | 1024px full-bleed app icon. Platforms round the corners      |
| `app-icon-dark.svg`      | iOS dark appearance, mark on transparency                    |
| `app-icon-tinted.svg`    | iOS tinted appearance, gray mark on transparency             |
| `ios/AppIcon.appiconset` | Xcode asset catalog, one 1024 image per appearance           |
| `android/res`            | Adaptive and themed icon, used directly by the Gradle build  |
| `android/play-store.png` | 512px Play Console icon                                      |
| `wordmark.py`            | Draws the wordmark and writes the logo files                 |
| `render.sh`              | Runs `wordmark.py`, then renders every PNG and the web icons |

`wordmark.py` also writes `apps/web/src/components/logo.gen.ts` and the
Android drawables `logo.xml` and `logo_dark.xml`. The web app serves
copies as `favicon.svg` and `apple-touch-icon.png`, and `brand.tsx` draws
the mark inline.

## Colors

The sunset has three stops, top to bottom. On dark backgrounds:
`#ffc56b`, `#f27a8f`, `#6d8cf5`. On light ones, use the deeper `#f59f00`,
`#e64980`, `#3b5bdb`, or the top of the sun fades into the page. In CSS
they're `--logo-sun`, `--logo-dusk`, and `--logo-horizon` in
`packages/ui/src/styles/globals.css`. The app icon sky runs from `#1d1a33`
to `#0e0e10`. The wordmark is `#18181b` on light and `#fafafa` on dark.

## Geometry

The mark is on a 24-unit grid. The sun is a radius-10 circle centered at
12,13, cut by gaps at y 15.1 to 16.2 and 17.8 to 19.2, and it ends at 20.7. Its
bounding box is 2.22,3 to 21.78,20.7, and every placement centers that box.

- iOS uses 30 px per unit on the 1024 canvas, so the mark is 587 px wide.
- Android uses 2.2 dp per unit on the 108 dp canvas. The farthest point is
  24 dp from center, inside the 33 dp safe zone.

## Changing it

Font, weight, tracking, and logo spacing are constants at the top of
`wordmark.py`. It downloads Unbounded from a pinned google/fonts commit,
checks the hash, and caches it in `~/.cache/matinee-brand`.

If you edit the mark, keep the path and color stops the same in the SVGs,
the Android drawables including `logo_mark.xml` and `logo_mark_dark.xml`,
`brand.tsx`, and `SUNSET` in `wordmark.py`. Then run `just brand` and
commit the output. It needs `resvg`, `oxipng`, and Python with fontTools
and uharfbuzz, and pulls missing ones through Nix.

Android only gets the adaptive icon, which needs API 26.
