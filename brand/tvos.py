"""Draws the Apple TV app's artwork into brand/tvos: the layered icon and
the Top Shelf images.

Both are one scene: the mark's sun going down on a horizon that runs the
width of the frame, with the sky glowing along it and dark water below.
The icon splits the scene by distance, so the tilt tvOS gives a focused
icon reads as depth:

- back: the dusk sky and its glow, the farthest thing there is. Opaque.
- middle: the sun, a whole disc.
- front: the water from the horizon down, with the mark's two bands on
  it. Its top edge is the horizon and hides the foot of the sun, so the
  sun slides behind the horizon as the icon tilts.

At rest the layers line up into the mark exactly. The Top Shelf images
are the same scene in one layer, the sun larger, with the wordmark above
it. Run this through render.sh, which renders the PNGs into the TV app's
asset catalog, and commit what both write.
"""

import sys
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ in brand/ from the import below

from wordmark import DARK, MARK_BOX, SKY, SUNSET, draw_word, gradient, number  # noqa: E402

BRAND = Path(__file__).resolve().parent
OUT = BRAND / "tvos"

# The mark split where the sun meets the horizon, at the foot of its dome.
# The sun is drawn as its whole disc, since the water hides what's below.
HORIZON = 15.1
SUN = "M2 13A10 10 0 1 0 22 13A10 10 0 1 0 2 13Z"
DOME = "M2.22 15.1A10 10 0 1 1 21.78 15.1Z"
assert SUNSET.startswith(DOME + "M"), "the mark changed: split it again here"
BANDS = SUNSET[len(DOME) :]

# The scene's light, in the mark's own colors: its middle stop glows along
# the horizon near the sun, its top stop warms the sun's foot, and its
# blue lights the far horizon and the water. The water is the sky's own
# gradient, so away from the glow it meets the sky without a seam.
GLOW = DARK["dusk"]
WARM = DARK["sun"]
FAR = DARK["horizon"]

# The icon, on tvOS's 400 by 240 point canvas, at the mark's height share
# and with the horizon this far down. tvOS 27 shows the whole canvas, 250
# points wide in the Dock and 306 focused; the tilt crops about 15 points
# off the sides and 9 off top and bottom, more off the front layer, and
# the mark stays well inside that.
ICON = (400, 240)
ICON_MARK = 0.66
ICON_HORIZON = 0.6

# The Top Shelf images. tvOS 27 shows the wide one 784 points tall, from
# the top of the screen to the Dock, so its middle 1765 pixels fill the
# screen's width; the regular one is cropped to the same middle. All of
# the picture is in there, centered, clear of the clock at the top right.
# The bottom band stops above the image's bottom edge, which tvOS mirrors
# behind the Dock, so the sun has a reflection.
SHELF_HEIGHT = 720
SHELF_MARK = 400  # the mark's height, in pixels
SHELF_FOOT = 44  # from the bottom band to the bottom edge
SHELF_WORD = 84  # the wordmark's height, to its baseline
SHELF_WORD_GAP = 64  # from the wordmark's baseline to the top of the sun


class Scene:
    """The scene on a `width` by `height` canvas, the mark `scale` pixels to
    its unit with its horizon at y = `horizon`, centered across."""

    def __init__(self, width: float, height: float, scale: float, horizon: float):
        self.width, self.height, self.scale, self.horizon = width, height, scale, horizon
        x0, _, x1, _ = MARK_BOX
        self.grid = (
            f'transform="translate({width / 2 - (x0 + x1) / 2 * scale:.3f} '
            f'{horizon - HORIZON * scale:.3f}) scale({scale:.5f})"'
        )

    def glow(self, id: str, rx: float, ry: float, color: str, opacity: float) -> str:
        """An elliptical gradient of `color` fading out from the sun's foot."""
        return (
            f'<radialGradient id="{id}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" '
            f'gradientTransform="translate({number(self.width / 2)} {number(self.horizon)}) '
            f'scale({number(rx)} {number(ry)})">'
            f'<stop offset="0" stop-color="{color}" stop-opacity="{opacity}"/>'
            f'<stop offset="0.4" stop-color="{color}" stop-opacity="{opacity * 0.35:.3f}"/>'
            f'<stop offset="1" stop-color="{color}" stop-opacity="0"/></radialGradient>'
        )

    def defs(self) -> str:
        """The gradients the layers fill with."""
        s = self.scale
        return (
            f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="{number(self.height)}" gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="{SKY[0]}"/><stop offset="1" stop-color="{SKY[1]}"/></linearGradient>'
            + gradient(DARK, "sunset")
            + self.glow("far", 0.8 * self.width, 7 * s, FAR, 0.34)
            + self.glow("glow", 24 * s, 5 * s, GLOW, 0.5)
            + self.glow("warm", 13 * s, 3 * s, WARM, 0.3)
            + self.glow("haze", 0.8 * self.width, 3 * s, FAR, 0.14)
            + self.glow("shine", 0.3 * self.width, 4 * s, GLOW, 0.2)
        )

    def fill(self, *names: str, top: float = 0) -> str:
        area = f'y="{number(top)}" width="{number(self.width)}" height="{number(self.height - top)}"'
        return "".join(f'<rect {area} fill="url(#{name})"/>' for name in names)

    def back(self) -> str:
        """The sky, lit along the horizon. It carries on below the horizon,
        under the water, so wherever the front layer moves off it shows."""
        return self.fill("sky", "far", "glow", "warm")

    def middle(self) -> str:
        return f'<path fill="url(#sunset)" {self.grid} d="{SUN}"/>'

    def front(self) -> str:
        """The water from the horizon down, with a little of the glow in it,
        and the bands."""
        return (
            self.fill("sky", "haze", "shine", top=self.horizon)
            + f'<path fill="url(#sunset)" {self.grid} d="{BANDS}"/>'
        )


def document(width: float, height: float, body: str, comment: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {number(width)} {number(height)}">\n'
        f"  <!-- {comment} Written by brand/tvos.py. -->\n"
        f"  {body}\n</svg>\n"
    )


def icon() -> dict[str, str]:
    width, height = ICON
    _, y0, _, y1 = MARK_BOX
    scene = Scene(width, height, ICON_MARK * height / (y1 - y0), ICON_HORIZON * height)
    layers = {
        "back": (scene.back(), "the dusk sky, glowing along the horizon. Opaque"),
        "middle": (scene.middle(), "the sun, whole; the front layer hides its foot"),
        "front": (scene.front(), "the water from the horizon down, with the mark's bands"),
    }
    return {
        f"icon-{name}.svg": document(width, height, scene.defs() + body, f"The Apple TV icon's {name} layer: {note}.")
        for name, (body, note) in layers.items()
    }


def shelf(width: float, word: str, word_width: float, word_height: float) -> str:
    """The scene in one layer under the wordmark, the mark's bottom band
    `SHELF_FOOT` above the bottom edge."""
    height = SHELF_HEIGHT
    _, y0, _, y1 = MARK_BOX
    scale = SHELF_MARK / (y1 - y0)
    bottom = height - SHELF_FOOT
    scene = Scene(width, height, scale, bottom - (y1 - HORIZON) * scale)
    fit = SHELF_WORD / word_height
    word_x = (width - word_width * fit) / 2
    word_y = bottom - SHELF_MARK - SHELF_WORD_GAP - SHELF_WORD
    return (
        scene.defs()
        + scene.back()
        + scene.middle()
        + scene.front()
        + f'<path fill="{DARK["ink"]}" transform="translate({word_x:.2f} {word_y:.2f}) scale({fit:.5f})" d="{word}"/>'
    )


def main() -> None:
    OUT.mkdir(exist_ok=True)
    files = icon()
    word, word_width, word_height, _ = draw_word()
    for name, width, what in (
        ("top-shelf.svg", 1920, "Top Shelf image"),
        ("top-shelf-wide.svg", 2320, "wide Top Shelf image"),
    ):
        files[name] = document(
            width,
            SHELF_HEIGHT,
            shelf(width, word, word_width, word_height),
            f"The Apple TV {what}: the icon's scene in one layer, with the wordmark above the sun.",
        )
    for name, text in files.items():
        (OUT / name).write_text(text)
        print(f"wrote {(OUT / name).relative_to(BRAND.parent)}")


if __name__ == "__main__":
    main()
