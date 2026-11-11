"""Draws the wordmark from Unbounded and writes every file that shows it.

The wordmark is "matinee" set in Unbounded Bold, lowercase, tracked in a
little, with its glyphs turned into outlines so nothing needs the font to
show it. Run it through render.sh, which provides fontTools and uharfbuzz,
and commit what it writes.
"""

import hashlib
import io
import os
import urllib.request
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

BRAND = Path(__file__).resolve().parent
WEB = BRAND.parent / "apps" / "web" / "src" / "components"

# Unbounded (SIL OFL 1.1), pinned to a commit of google/fonts. A logo made
# of its outlines isn't the font software, so the license asks nothing of
# the files written here.
FONT_URL = (
    "https://raw.githubusercontent.com/google/fonts/"
    "8b80d4f3f73cfe02b69a6f0dc71da5a1cc574bd3/ofl/unbounded/Unbounded%5Bwght%5D.ttf"
)
FONT_SHA256 = "323b511be380c8d474ef030686b71aedde501f8d9cd46da558b7c40454372c3f"

TEXT = "matinee"
WEIGHT = 700
TRACKING = -0.02  # em
SCALE = 0.1  # output units per font unit, so 100 to the em

# The mark, as in mark.svg. Its bounding box runs from 2.22,3 to 21.78,20.7.
SUNSET = (
    "M2.22 15.1A10 10 0 1 1 21.78 15.1Z"
    "M2.53 16.2H21.47A10 10 0 0 1 20.77 17.8H3.23A10 10 0 0 1 2.53 16.2Z"
    "M4.15 19.2H19.85A10 10 0 0 1 18.38 20.7H5.62A10 10 0 0 1 4.15 19.2Z"
)
MARK_BOX = (2.22, 3.0, 21.78, 20.7)
# In the logo the mark's horizon sits on the word's baseline, and its sun
# rises as high as the word does.
MARK_HEIGHT = 1.0  # of the wordmark's height
GAP = 0.3  # of the mark's width

# Colors, as in mark.svg and globals.css: the deep set on light, the bright
# set on dark, and the theme's foreground for the word.
LIGHT = {"sun": "#f59f00", "dusk": "#e64980", "horizon": "#3b5bdb", "ink": "#18181b"}
DARK = {"sun": "#ffc56b", "dusk": "#f27a8f", "horizon": "#6d8cf5", "ink": "#fafafa"}
SKY = ("#1d1a33", "#0e0e10")


def number(value: float) -> str:
    text = f"{value:.1f}".rstrip("0").rstrip(".")
    return "0" if text == "-0" else text


def load_font() -> TTFont:
    cache = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
    path = cache / "matinee-brand" / f"Unbounded-{FONT_SHA256[:12]}.ttf"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(FONT_URL) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != FONT_SHA256:
            raise SystemExit(f"Unbounded from {FONT_URL} doesn't match its hash")
        path.write_bytes(data)
    return instantiateVariableFont(TTFont(path), {"wght": WEIGHT})


def draw_word() -> tuple[str, float, float]:
    """The outlines of the word, with its width and height. The word starts
    at x 0 and stands on its baseline at y = height."""
    font = load_font()
    data = io.BytesIO()
    font.save(data)
    shaper = hb.Font(hb.Face(data.getvalue()))
    buffer = hb.Buffer()
    buffer.add_str(TEXT)
    buffer.guess_segment_properties()
    hb.shape(shaper, buffer, {"kern": True})

    glyphs = font.getGlyphSet()
    order = font.getGlyphOrder()
    em = font["head"].unitsPerEm

    placed = []
    x = 0.0
    for info, position in zip(buffer.glyph_infos, buffer.glyph_positions):
        placed.append((order[info.codepoint], x + position.x_offset))
        x += position.x_advance + TRACKING * em

    bounds = BoundsPen(glyphs)
    for name, gx in placed:
        glyphs[name].draw(TransformPen(bounds, (1, 0, 0, -1, gx, 0)))
    left, top, right, _ = bounds.bounds

    pen = SVGPathPen(glyphs, ntos=number)
    for name, gx in placed:
        transform = (SCALE, 0, 0, -SCALE, (gx - left) * SCALE, -top * SCALE)
        glyphs[name].draw(TransformPen(pen, transform))
    return pen.getCommands(), (right - left) * SCALE, -top * SCALE


def gradient(colors: dict[str, str] | None, id: str) -> str:
    x0, y0, x1, y1 = MARK_BOX
    stops = "".join(
        f'<stop {attr} offset="{offset}"/>'
        for offset, attr in (
            ("0", f'stop-color="{colors["sun"]}"' if colors else 'class="sun"'),
            ("0.5", f'stop-color="{colors["dusk"]}"' if colors else 'class="dusk"'),
            ("1", f'stop-color="{colors["horizon"]}"' if colors else 'class="horizon"'),
        )
    )
    return (
        f'<linearGradient id="{id}" x1="0" y1="{number(y0)}" x2="0" y2="{number(y1)}" '
        f'gradientUnits="userSpaceOnUse">{stops}</linearGradient>'
    )


SCHEME_STYLE = (
    "<style>"
    f".sun {{ stop-color: {LIGHT['sun']} }} .dusk {{ stop-color: {LIGHT['dusk']} }} "
    f".horizon {{ stop-color: {LIGHT['horizon']} }} .ink {{ fill: {LIGHT['ink']} }} "
    "@media (prefers-color-scheme: dark) { "
    f".sun {{ stop-color: {DARK['sun']} }} .dusk {{ stop-color: {DARK['dusk']} }} "
    f".horizon {{ stop-color: {DARK['horizon']} }} .ink {{ fill: {DARK['ink']} }} "
    "}</style>"
)


def placement(width: float, height: float) -> tuple[str, float, float]:
    """Where the lockup puts the mark, as a transform from its 24 unit grid,
    then where the word starts and how wide the whole is."""
    x0, y0, x1, y1 = MARK_BOX
    scale = MARK_HEIGHT * height / (y1 - y0)
    mark_width = (x1 - x0) * scale
    word_x = mark_width + GAP * mark_width
    transform = f"translate({number(-x0 * scale)} {number(height - y1 * scale)}) scale({scale:.4f})"
    return transform, word_x, word_x + width


def lockup(word: str, width: float, height: float, colors: dict[str, str] | None):
    """The mark and the word side by side, as SVG content and its size."""
    transform, word_x, total = placement(width, height)
    ink = f'fill="{colors["ink"]}"' if colors else 'class="ink"'
    body = (
        f'<path fill="url(#sunset)" transform="{transform}" d="{SUNSET}"/>'
        f'<path {ink} transform="translate({number(word_x)} 0)" d="{word}"/>'
    )
    return gradient(colors, "sunset") + body, total, height


def svg(view: tuple[float, float, float, float], body: str, comment: str, size: str = "") -> str:
    box = " ".join(number(v) for v in view)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}"{size}>\n'
        f"  <!-- {comment} Written by brand/wordmark.py. -->\n"
        f"  {body}\n</svg>\n"
    )


def write(path: Path, text: str) -> None:
    path.write_text(text)
    print(f"wrote {path.relative_to(BRAND.parent)}")


def main() -> None:
    word, width, height = draw_word()
    pad = height * 0.08

    write(
        BRAND / "wordmark.svg",
        svg(
            (0, 0, width, height),
            SCHEME_STYLE + f'<path class="ink" d="{word}"/>',
            "The wordmark alone, dark on light and light on dark.",
        ),
    )

    body, w, h = lockup(word, width, height, None)
    write(
        BRAND / "logo.svg",
        svg(
            (-pad, -pad, w + 2 * pad, h + 2 * pad),
            SCHEME_STYLE + body,
            "The mark and the wordmark, picking colors from the viewer's scheme.",
        ),
    )
    for name, colors, note in (
        ("logo-light.svg", LIGHT, "for light backgrounds"),
        ("logo-dark.svg", DARK, "for dark backgrounds"),
    ):
        body, w, h = lockup(word, width, height, colors)
        write(
            BRAND / name,
            svg((-pad, -pad, w + 2 * pad, h + 2 * pad), body, f"The logo in fixed colors, {note}."),
        )

    # GitHub's social preview, 1280 by 640, with the logo on the app icon's
    # sky. render.sh turns it into a PNG.
    body, w, h = lockup(word, width, height, DARK)
    fit = 720 / w
    social = (
        '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="640" gradientUnits="userSpaceOnUse">'
        f'<stop offset="0" stop-color="{SKY[0]}"/><stop offset="1" stop-color="{SKY[1]}"/>'
        '</linearGradient><rect width="1280" height="640" fill="url(#sky)"/>'
        f'<g transform="translate({number((1280 - w * fit) / 2)} {number((640 - h * fit) / 2)}) '
        f'scale({fit:.4f})">{body}</g>'
    )
    write(
        BRAND / "social-preview.svg",
        svg((0, 0, 1280, 640), social, "GitHub's social preview, the logo on the dusk sky."),
    )

    # The web app draws the logo inline, so the word follows the text color
    # and the mark the theme's logo colors.
    transform, word_x, total = placement(width, height)
    write(
        WEB / "logo.gen.ts",
        "// Written by brand/wordmark.py. Don't edit; run brand/render.sh.\n\n"
        "/**\n"
        " * The logo's layout: the mark on its 24 unit grid moved by `mark`, and\n"
        " * the word's outlines from `wordX`, standing on the baseline at y =\n"
        " * `height`.\n"
        " */\n"
        "export const LOGO = {\n"
        f"  width: {number(total)},\n"
        f"  height: {number(height)},\n"
        f'  mark: "{transform}",\n'
        f"  wordX: {number(word_x)},\n"
        f'  path: "{word}",\n'
        "}\n",
    )


if __name__ == "__main__":
    main()
