#!/usr/bin/env python3
"""Turn lucide icons into Android vector drawables.

The web app draws its icons with lucide-react; the app uses the same ones,
so both look alike. Reads the icons from the web app's node_modules (run
`pnpm install` at the repository root first) and writes
app/src/main/res/drawable/lucide_<name>.xml, stroked in white for `Icon` to
tint. A name ending in `:filled` also fills the shapes, as the web does with
`fill-current` on play, heart, and star.

    scripts/lucide.py play:filled search heart heart:filled ...
    scripts/lucide.py --all    # every icon the app has already
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent.parent
OUT = ROOT / "app/src/main/res/drawable"


def lucide_dir() -> Path:
    pnpm = REPO / "node_modules/.pnpm"
    for candidate in sorted(pnpm.glob("lucide-react@*/node_modules/lucide-react")):
        return candidate / "dist/esm/icons"
    sys.exit("lucide-react isn't installed; run pnpm install at the repository root")


def icon_nodes(name: str) -> list:
    path = lucide_dir() / f"{name}.mjs"
    if not path.exists():
        sys.exit(f"no lucide icon named {name}")
    # Old names, like circle-alert, only re-export the icon's new name.
    alias = re.search(r"export \{ default \} from '\./([a-z0-9-]+)\.mjs'", path.read_text())
    if alias:
        return icon_nodes(alias.group(1))
    script = (
        f"import {{ __iconData }} from {json.dumps(path.as_uri())};"
        "console.log(JSON.stringify(__iconData.node))"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def num(value: str | float) -> str:
    number = float(value)
    return str(int(number)) if number.is_integer() else f"{number:g}"


def circle(cx: float, cy: float, r: float) -> str:
    return (
        f"M{num(cx - r)},{num(cy)}"
        f"a{num(r)},{num(r)} 0 1,0 {num(2 * r)},0"
        f"a{num(r)},{num(r)} 0 1,0 {num(-2 * r)},0Z"
    )


def ellipse(cx: float, cy: float, rx: float, ry: float) -> str:
    return (
        f"M{num(cx - rx)},{num(cy)}"
        f"a{num(rx)},{num(ry)} 0 1,0 {num(2 * rx)},0"
        f"a{num(rx)},{num(ry)} 0 1,0 {num(-2 * rx)},0Z"
    )


def rect(attrs: dict) -> str:
    x = float(attrs.get("x", 0))
    y = float(attrs.get("y", 0))
    w = float(attrs["width"])
    h = float(attrs["height"])
    rx = float(attrs.get("rx", attrs.get("ry", 0)))
    ry = float(attrs.get("ry", rx))
    if rx == 0:
        return f"M{num(x)},{num(y)}h{num(w)}v{num(h)}h{num(-w)}Z"
    rx = min(rx, w / 2)
    ry = min(ry, h / 2)
    arc = f"a{num(rx)},{num(ry)} 0 0,1"
    return (
        f"M{num(x + rx)},{num(y)}"
        f"h{num(w - 2 * rx)}{arc} {num(rx)},{num(ry)}"
        f"v{num(h - 2 * ry)}{arc} {num(-rx)},{num(ry)}"
        f"h{num(-(w - 2 * rx))}{arc} {num(-rx)},{num(-ry)}"
        f"v{num(-(h - 2 * ry))}{arc} {num(rx)},{num(-ry)}Z"
    )


def points(value: str, close: bool) -> str:
    coords = [float(n) for n in re.split(r"[\s,]+", value.strip()) if n]
    pairs = [f"{num(coords[i])},{num(coords[i + 1])}" for i in range(0, len(coords), 2)]
    return "M" + "L".join(pairs) + ("Z" if close else "")


def path_data(tag: str, attrs: dict) -> str:
    if tag == "path":
        return attrs["d"]
    if tag == "circle":
        return circle(float(attrs["cx"]), float(attrs["cy"]), float(attrs["r"]))
    if tag == "ellipse":
        return ellipse(
            float(attrs["cx"]), float(attrs["cy"]), float(attrs["rx"]), float(attrs["ry"])
        )
    if tag == "rect":
        return rect(attrs)
    if tag == "line":
        return f"M{num(attrs['x1'])},{num(attrs['y1'])}L{num(attrs['x2'])},{num(attrs['y2'])}"
    if tag in ("polyline", "polygon"):
        return points(attrs["points"], tag == "polygon")
    sys.exit(f"unknown SVG element {tag}")


def drawable(name: str, filled: bool) -> str:
    paths = []
    for tag, attrs in icon_nodes(name):
        fill = ' android:fillColor="#FFFFFFFF"' if filled else ""
        paths.append(
            "    <path\n"
            f'        android:pathData="{path_data(tag, attrs)}"{fill}\n'
            '        android:strokeColor="#FFFFFFFF"\n'
            '        android:strokeWidth="2"\n'
            '        android:strokeLineCap="round"\n'
            '        android:strokeLineJoin="round" />'
        )
    body = "\n".join(paths)
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        f"<!-- lucide {name}{' (filled)' if filled else ''}, ISC license. "
        "Made by scripts/lucide.py. -->\n"
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        '    android:width="24dp"\n'
        '    android:height="24dp"\n'
        '    android:viewportWidth="24"\n'
        '    android:viewportHeight="24">\n'
        f"{body}\n"
        "</vector>\n"
    )


def existing() -> list[str]:
    names = []
    for file in sorted(OUT.glob("lucide_*.xml")):
        name = file.stem.removeprefix("lucide_")
        if name.endswith("_filled"):
            names.append(name.removesuffix("_filled").replace("_", "-") + ":filled")
        else:
            names.append(name.replace("_", "-"))
    return names


def main() -> None:
    args = sys.argv[1:]
    if args == ["--all"]:
        args = existing()
    if not args:
        sys.exit(__doc__)
    OUT.mkdir(parents=True, exist_ok=True)
    for arg in args:
        name, _, variant = arg.partition(":")
        filled = variant == "filled"
        resource = name.replace("-", "_") + ("_filled" if filled else "")
        (OUT / f"lucide_{resource}.xml").write_text(drawable(name, filled))
        print(f"lucide_{resource}")


if __name__ == "__main__":
    main()
