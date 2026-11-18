#!/usr/bin/env python3
"""Turn the Android kit's lucide icons and the brand's logo into iOS assets.

The icons belong to the design kit, Packages/MatineeKit, which the app
draws every icon through. They're the ones the Android kit draws, read from
its vector drawables (apps/android/app/src/main/res/drawable/lucide_*.xml,
which its scripts/lucide.py makes from lucide), so both apps have the same
set and the same shapes. Each becomes an SVG template image in the kit's
Resources/Lucide.xcassets, which takes the foreground color like an SF
Symbol, and Kotlin's `Lucide` object in ui/kit/Icon.kt becomes the kit's
public `Lucide`, in Icons/Lucide.gen.swift: `Lucide.ArrowLeft` is
`Lucide.arrowLeft`. KIT_EXTRAS adds the few the kit draws that Android
folds elsewhere, like the toasts' status icons, read from lucide-react in
node_modules (run `pnpm install` at the repository root first; it needs
node).

The logo comes from brand/ into the app's Assets.xcassets/Brand:
brand/logo-light.svg and logo-dark.svg as one image for both appearances,
and brand/mark.svg, whose colors follow the color scheme in CSS, as a
light and a dark image.

To add an icon, add it to the Android kit first (its scripts/lucide.py and
its `Lucide` object), or to KIT_EXTRAS when Android doesn't draw it, then
run this.

    scripts/lucide.py                 # write the app's brand assets
    scripts/lucide.py --check         # fail when they're out of date
    scripts/lucide.py --kit           # write the kit's icons
    scripts/lucide.py --kit --check   # fail when they're out of date
"""

import json
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent.parent
ANDROID = ROOT.parent / "android/app/src/main"
DRAWABLES = ANDROID / "res/drawable"
BRAND = REPO / "brand"
ASSETS = ROOT / "Matinee/Resources/Assets.xcassets"

NS = "{http://schemas.android.com/apk/res/android}"
INFO = {"author": "xcode", "version": 1}


def fail(message: str) -> None:
    sys.exit(f"lucide.py: {message}")


def contents(document: dict) -> str:
    # Plain two-space JSON, which is how the repository's formatter
    # (`pnpm fmt`) writes it too; Xcode reads either.
    return json.dumps(document, indent=2, sort_keys=True) + "\n"


def svg_from_drawable(path: Path) -> str:
    """The drawable's paths as SVG, black on clear, for a template image."""
    root = ET.parse(path).getroot()
    size = f'{root.get(NS + "viewportWidth")} {root.get(NS + "viewportHeight")}'
    paths = []
    for element in root.iter("path"):
        data = element.get(NS + "pathData")
        filled = element.get(NS + "fillColor") is not None
        stroked = element.get(NS + "strokeColor") is not None
        attributes = [f'd="{data}"', f'fill="{"#000" if filled else "none"}"']
        if stroked:
            attributes += [
                'stroke="#000"',
                f'stroke-width="{element.get(NS + "strokeWidth", "1")}"',
                f'stroke-linecap="{element.get(NS + "strokeLineCap", "butt")}"',
                f'stroke-linejoin="{element.get(NS + "strokeLineJoin", "miter")}"',
            ]
        paths.append(f"  <path {' '.join(attributes)}/>")
    name = path.stem.removeprefix("lucide_")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 {size}">\n'
        f"  <!-- lucide {name}, ISC license. Made by scripts/lucide.py from Android's drawable. -->\n"
        + "\n".join(paths)
        + "\n</svg>\n"
    )


def imageset(files: list[tuple[str, str | None]], template: bool) -> str:
    images = []
    for filename, appearance in files:
        image: dict = {"filename": filename, "idiom": "universal"}
        if appearance is not None:
            image["appearances"] = [{"appearance": "luminosity", "value": appearance}]
        images.append(image)
    properties: dict = {"preserves-vector-representation": True}
    if template:
        properties["template-rendering-intent"] = "template"
    return contents({"images": images, "info": INFO, "properties": properties})


def mark_variants() -> tuple[str, str]:
    """brand/mark.svg in fixed colors, for light backgrounds and for dark ones."""
    source = (BRAND / "mark.svg").read_text()
    style = re.search(r"<style>(.*?)</style>", source, re.S)
    if style is None:
        fail("brand/mark.svg has no <style> to read its colors from")
    light_rules, _, dark_rules = style.group(1).partition("@media (prefers-color-scheme: dark)")

    def stops(rules: str) -> dict[str, str]:
        return dict(re.findall(r"\.(\w+)\s*\{\s*stop-color:\s*(#[0-9a-fA-F]{6})\s*\}", rules))

    def fixed(colors: dict[str, str], scheme: str) -> str:
        body = re.sub(r"\s*<!--.*?-->", "", source, count=1, flags=re.S)
        body = re.sub(r"\s*<style>.*?</style>", "", body, flags=re.S)
        body = re.sub(r'class="(\w+)"', lambda m: f'stop-color="{colors[m.group(1)]}"', body)
        return body.replace(
            'viewBox="0 0 24 24">',
            f'viewBox="0 0 24 24">\n  <!-- brand/mark.svg for {scheme} backgrounds. Made by scripts/lucide.py. -->',
            1,
        )

    return fixed(stops(light_rules), "light"), fixed(stops(dark_rules), "dark")


def outputs() -> dict[Path, str]:
    files: dict[Path, str] = {}
    brand = ASSETS / "Brand"
    files[brand / "Contents.json"] = contents({"info": INFO})
    logo = brand / "logo.imageset"
    files[logo / "logo-light.svg"] = (BRAND / "logo-light.svg").read_text()
    files[logo / "logo-dark.svg"] = (BRAND / "logo-dark.svg").read_text()
    files[logo / "Contents.json"] = imageset([("logo-light.svg", None), ("logo-dark.svg", "dark")], template=False)
    light, dark = mark_variants()
    mark = brand / "logo_mark.imageset"
    files[mark / "mark-light.svg"] = light
    files[mark / "mark-dark.svg"] = dark
    files[mark / "Contents.json"] = imageset([("mark-light.svg", None), ("mark-dark.svg", "dark")], template=False)
    return files


# --kit: the kit's own copy, from the Kotlin kit's `Lucide` object.
KIT = ROOT / "Packages/MatineeKit/Sources/MatineeKit"
KIT_ASSETS = KIT / "Resources/Lucide.xcassets"
KIT_SWIFT = KIT / "Icons/Lucide.gen.swift"
KIT_KOTLIN = ANDROID / "java/io/github/zekurio/matinee/ui/kit/Icon.kt"

# Icons the kit draws that Android has no drawable for: (Swift name, lucide
# name, stroke width). The web's checkbox draws its check at 3, its
# select's at 2.5.
KIT_EXTRAS = [
    ("triangleAlert", "triangle-alert", 2),
    ("octagonX", "octagon-x", 2),
    ("checkBold", "check", 3),
    ("minus", "minus", 3),
    ("eye", "eye", 2),
    # The player's AirPlay button, drawn over the system's route picker.
    ("airplay", "airplay", 2),
]


def lucide_icons_dir() -> Path:
    pnpm = REPO / "node_modules/.pnpm"
    for candidate in sorted(pnpm.glob("lucide-react@*/node_modules/lucide-react")):
        return candidate / "dist/esm/icons"
    fail("lucide-react isn't installed; run pnpm install at the repository root")
    raise SystemExit


def lucide_nodes(name: str) -> list:
    path = lucide_icons_dir() / f"{name}.mjs"
    if not path.exists():
        fail(f"no lucide icon named {name}")
    # Old names, like triangle-alert, only re-export the icon's new name.
    alias = re.search(r"export \{ default \} from '\./([a-z0-9-]+)\.mjs'", path.read_text())
    if alias:
        return lucide_nodes(alias.group(1))
    script = f"import {{ __iconData }} from {json.dumps(path.as_uri())};console.log(JSON.stringify(__iconData.node))"
    result = subprocess.run(["node", "--input-type=module", "-e", script], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def svg_from_lucide(name: str, stroke: float) -> str:
    """A lucide icon's elements as SVG, black on clear, as lucide draws them."""
    elements = []
    for tag, attrs in lucide_nodes(name):
        attributes = " ".join(f'{key}="{value}"' for key, value in attrs.items() if key != "key")
        elements.append(f"  <{tag} {attributes}/>")
    width = f"{stroke:g}"
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"'
        f' stroke="#000" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round">\n'
        f"  <!-- lucide {name}, ISC license. Made for the kit by apps/ios/scripts/lucide.py from lucide-react. -->\n"
        + "\n".join(elements)
        + "\n</svg>\n"
    )


def kit_kotlin_icons() -> list[tuple[str, str]]:
    source = KIT_KOTLIN.read_text()
    body = re.search(r"object Lucide \{(.*?)\n\}", source, re.S)
    if body is None:
        fail(f"no `object Lucide` in {KIT_KOTLIN.name}")
    return re.findall(r"val (\w+) = R\.drawable\.(lucide_\w+)", body.group(1))


def kit_swift_source(icons: list[tuple[str, str]]) -> str:
    lines = [f'  public static let {swift} = Lucide("{asset}")' for swift, asset in icons]
    return (
        "// Generated by apps/ios/scripts/lucide.py --kit from Kotlin's `Lucide` object in\n"
        "// apps/android/.../ui/kit/Icon.kt and the script's KIT_EXTRAS. Don't edit; run it again.\n"
        "\n"
        "/// The icons the web app draws, from lucide, as the Android app has them:\n"
        "/// Kotlin's `Lucide.ArrowLeft` is `Lucide.arrowLeft`. Draw one with `LucideIcon`.\n"
        "public nonisolated struct Lucide: Hashable, Sendable {\n"
        "  /// The image's name in the kit's asset catalog.\n"
        "  public let name: String\n"
        "\n"
        "  private init(_ name: String) { self.name = name }\n"
        "\n"
        + "\n".join(lines)
        + "\n}\n"
    )


def kit_outputs() -> dict[Path, str]:
    files: dict[Path, str] = {KIT_ASSETS / "Contents.json": contents({"info": INFO})}
    names = {drawable.stem for drawable in DRAWABLES.glob("lucide_*.xml")}
    icons: list[tuple[str, str]] = []
    for name, drawable in kit_kotlin_icons():
        if drawable not in names:
            fail(f"Lucide.{name} is {drawable}, which isn't in Android's drawables")
        folder = KIT_ASSETS / f"{drawable}.imageset"
        files[folder / f"{drawable}.svg"] = svg_from_drawable(DRAWABLES / f"{drawable}.xml")
        files[folder / "Contents.json"] = imageset([(f"{drawable}.svg", None)], template=True)
        icons.append((name[0].lower() + name[1:], drawable))
    taken = {swift for swift, _ in icons}
    for swift, lucide, stroke in KIT_EXTRAS:
        if swift in taken:
            fail(f"KIT_EXTRAS' {swift} is already in Android's Lucide; drop it from the extras")
        asset = "lucide_kit_" + re.sub(r"(?<!^)(?=[A-Z])", "_", swift).lower()
        folder = KIT_ASSETS / f"{asset}.imageset"
        files[folder / f"{asset}.svg"] = svg_from_lucide(lucide, stroke)
        files[folder / "Contents.json"] = imageset([(f"{asset}.svg", None)], template=True)
        icons.append((swift, asset))
    files[KIT_SWIFT] = kit_swift_source(sorted(icons))
    return files


def main() -> None:
    args = sys.argv[1:]
    kit = "--kit" in args
    if kit:
        args = [arg for arg in args if arg != "--kit"]
    check = args == ["--check"]
    if args and not check:
        sys.exit(__doc__)
    files = kit_outputs() if kit else outputs()
    owned = [KIT_ASSETS] if kit else [ASSETS / "Brand"]
    extra = [path for folder in owned if folder.exists() for path in folder.rglob("*") if path.is_file() and path not in files]
    stale = [path for path, text in files.items() if not path.exists() or path.read_text() != text]
    if check:
        if stale or extra:
            fail(f"{len(stale) + len(extra)} icon files out of date; run scripts/lucide.py")
        return
    for path in extra:
        path.unlink()
    for folder in owned:
        for directory in sorted(folder.rglob("*"), reverse=True):
            if directory.is_dir() and not any(directory.iterdir()):
                shutil.rmtree(directory)
    for path in stale:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(files[path])
    print(f"{len(files) - 1} files, {len(stale)} written, {len(extra)} removed")


if __name__ == "__main__":
    main()
