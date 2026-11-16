#!/usr/bin/env bash
# Draws the Apple TV app's icon and Top Shelf image from the mark in brand/
# (brand/README.md) into MatineeTV/Resources/TVAppIcon.xcassets, which is
# committed: the TV's icon is a layered image stack, and brand/ has no
# tvOS drawing yet, so this builds one from the mark's own paths and colors.
#
# The icon has three layers for the parallax tvOS gives a focused icon: the
# dusk sky at the back, the sun's dome in the middle, and the two horizon
# bands in front, so the sun moves behind the horizon as the icon tilts.
# The Top Shelf images are the logo on the same sky. Run it after changing
# the mark, and commit what it writes. It needs resvg and oxipng, and pulls
# them through Nix when they're missing.
set -euo pipefail

if ! command -v resvg >/dev/null || ! command -v oxipng >/dev/null; then
  exec nix shell nixpkgs#resvg nixpkgs#oxipng -c "$0" "$@"
fi

here=$(cd "$(dirname "$0")/.." && pwd)
brand="$here/../../brand"
catalog="$here/MatineeTV/Resources/TVAppIcon.xcassets"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

python3 - "$brand" "$catalog" "$work" <<'PY'
import json, os, re, shutil, subprocess, sys

brand, catalog, work = sys.argv[1:4]
info = {"info": {"author": "xcode", "version": 1}}

# The mark's paths and colors, as brand/app-icon.svg has them.
SKY = ("#1d1a33", "#0e0e10")
SUNSET = '''<linearGradient id="sunset" x1="0" y1="3" x2="0" y2="20.7" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#ffc56b"/><stop offset="0.5" stop-color="#f27a8f"/><stop offset="1" stop-color="#6d8cf5"/>
</linearGradient>'''
DOME = "M2.22 15.1A10 10 0 1 1 21.78 15.1Z"
BANDS = ("M2.53 16.2H21.47A10 10 0 0 1 20.77 17.8H3.23A10 10 0 0 1 2.53 16.2Z"
         "M4.15 19.2H19.85A10 10 0 0 1 18.38 20.7H5.62A10 10 0 0 1 4.15 19.2Z")
# The mark's bounding box, which every placement centers (brand/README.md).
BOX = (2.22, 3.0, 21.78, 20.7)


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def render(svg, width, height, png):
    source = os.path.join(work, os.path.basename(png) + ".svg")
    with open(source, "w") as f:
        f.write(svg)
    os.makedirs(os.path.dirname(png), exist_ok=True)
    subprocess.run(["resvg", "--width", str(width), "--height", str(height), source, png], check=True)


def sky(width, height):
    return (f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="{height}" gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="{SKY[0]}"/><stop offset="1" stop-color="{SKY[1]}"/></linearGradient>'
            f'<rect width="{width}" height="{height}" fill="url(#sky)"/>')


def mark(width, height, share, path):
    """`path` of the mark, its box `share` of the height, centered."""
    scale = share * height / (BOX[3] - BOX[1])
    x = width / 2 - (BOX[0] + BOX[2]) / 2 * scale
    y = height / 2 - (BOX[1] + BOX[3]) / 2 * scale
    return f'{SUNSET}<g transform="translate({x:.3f} {y:.3f}) scale({scale:.4f})"><path fill="url(#sunset)" d="{path}"/></g>'


def svg(width, height, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">{body}</svg>'


def stack(name, width, height, scales):
    """An image stack of the three layers, at each of `scales`."""
    folder = os.path.join(catalog, "App Icon & Top Shelf Image.brandassets", f"{name}.imagestack")
    layers = {
        "Front": mark(width, height, 0.56, BANDS),
        "Middle": mark(width, height, 0.56, DOME),
        "Back": sky(width, height),
    }
    for layer, body in layers.items():
        content = os.path.join(folder, f"{layer}.imagestacklayer", "Content.imageset")
        images = []
        for scale in scales:
            file = f"{layer.lower()}{'' if scale == 1 else f'@{scale}x'}.png"
            render(svg(width, height, body), width * scale, height * scale, os.path.join(content, file))
            images.append({"filename": file, "idiom": "tv", "scale": f"{scale}x"})
        write(os.path.join(content, "Contents.json"), {"images": images, **info})
        write(os.path.join(folder, f"{layer}.imagestacklayer", "Contents.json"), info)
    write(os.path.join(folder, "Contents.json"),
          {"layers": [{"filename": f"{layer}.imagestacklayer"} for layer in layers], **info})


def logo(width, height, share):
    """brand/logo-dark.svg, `share` of the height, centered."""
    with open(os.path.join(brand, "logo-dark.svg")) as f:
        text = f.read()
    box = [float(v) for v in re.search(r'viewBox="([^"]+)"', text).group(1).split()]
    inner = re.sub(r"^.*?<svg[^>]*>|</svg>\s*$", "", text, flags=re.S)
    inner = re.sub(r"<!--.*?-->", "", inner, flags=re.S)
    h = share * height
    w = h * box[2] / box[3]
    return (f'<svg x="{(width - w) / 2:.2f}" y="{(height - h) / 2:.2f}" width="{w:.2f}" height="{h:.2f}" '
            f'viewBox="{" ".join(map(str, box))}">{inner}</svg>')


def shelf(name, width, height):
    folder = os.path.join(catalog, "App Icon & Top Shelf Image.brandassets", f"{name}.imageset")
    images = []
    for scale in (1, 2):
        file = f"top-shelf{'-wide' if 'Wide' in name else ''}{'' if scale == 1 else '@2x'}.png"
        render(svg(width, height, sky(width, height) + logo(width, height, 0.17)), width * scale, height * scale,
               os.path.join(folder, file))
        images.append({"filename": file, "idiom": "tv", "scale": f"{scale}x"})
    write(os.path.join(folder, "Contents.json"), {"images": images, **info})


shutil.rmtree(catalog, ignore_errors=True)
write(os.path.join(catalog, "Contents.json"), info)
stack("App Icon", 400, 240, (1, 2))
stack("App Icon - App Store", 1280, 768, (1,))
shelf("Top Shelf Image", 1920, 720)
shelf("Top Shelf Image Wide", 2320, 720)
write(os.path.join(catalog, "App Icon & Top Shelf Image.brandassets", "Contents.json"), {
    "assets": [
        {"filename": "App Icon - App Store.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "1280x768"},
        {"filename": "App Icon.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "400x240"},
        {"filename": "Top Shelf Image Wide.imageset", "idiom": "tv", "role": "top-shelf-image-wide", "size": "2320x720"},
        {"filename": "Top Shelf Image.imageset", "idiom": "tv", "role": "top-shelf-image", "size": "1920x720"},
    ],
    **info,
})
PY

# Lossless; drops the alpha channel from the opaque back layers and shelves,
# which the App Store wants of an icon's back layer.
find "$catalog" -name '*.png' -print0 | xargs -0 oxipng --quiet --opt 4 --strip safe
