#!/usr/bin/env python3
"""Copy the web app's messages for some areas into Android string files.

The admin pages port the web's settings panels, so they say what the web
says, in every language the app has. This reads the web's catalogs in
apps/web/src/i18n/locales/<lang>/<area>.ts and writes
app/src/main/res/values[-<lang>]/strings_web_<area>.xml (lowercase), a string or plural
per message, named `web_` and the key with dots and dashes as underscores:
"jobs.queue.waiting" becomes `web_jobs_queue_waiting`.

Placeholders become positional arguments in the order they first appear in
the English message, the same in every language: "{done} of {total}" is
`%1$s of %2$s`. In a plural, `{count}` is the quantity, `%1$d`, and comes
first. Run it again after the web's messages change:

    scripts/web_strings.py
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ROOT.parent / "web/src/i18n/locales"
RES = ROOT / "app/src/main/res"

AREAS = ["appearance", "common", "jobs", "libraries", "oidc", "serverAppearance", "transcoding", "trickplay", "users"]
# The app's languages: English in values/, the rest in values-<lang>/.
LANGUAGES = {"en": "values", "de": "values-de"}

TOKEN = re.compile(
    r'''\s*(?:
        (?P<comment>//[^\n]*|/\*.*?\*/)
      | "(?P<key>(?:[^"\\]|\\.)*)"\s*:\s*
    )''',
    re.S | re.X,
)
STRING = re.compile(r'"((?:[^"\\]|\\.)*)"', re.S)
PLACEHOLDER = re.compile(r"\{(\w+)\}")


def unescape(text: str) -> str:
    """A TypeScript string literal's text, as JSON reads it, with \\' too."""
    return json.loads('"' + text.replace("\\'", "'") + '"')


def skip_string(source: str, i: int) -> int:
    """Past the string literal that starts at `i`."""
    i += 1
    while source[i] != '"':
        i += 2 if source[i] == "\\" else 1
    return i + 1


def read_value(source: str, at: int):
    """The message at `at`: a string, or a plural's forms. Returns it and where it ends."""
    m = re.compile(r'\s*"((?:[^"\\]|\\.)*)"', re.S).match(source, at)
    if m:
        return unescape(m.group(1)), m.end()
    m = re.compile(r"\s*plural\(").match(source, at)
    if m:
        depth, i = 1, m.end()
        while depth:
            c = source[i]
            if c == '"':
                i = skip_string(source, i)
                continue
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
            i += 1
        body = source[m.end():i - 1]
        forms = {k: unescape(v) for k, v in re.findall(r'(\w+)\s*:\s*"((?:[^"\\]|\\.)*)"', body, re.S)}
        return forms, i
    raise ValueError(f"can't read the message at {source[at:at + 60]!r}")


def messages(path: Path) -> dict:
    source = path.read_text()
    # English is `defineMessages("area", {...})`, the others `export default {...}`.
    head = source.find("defineMessages(")
    if head < 0:
        head = source.index("export default")
    out, i = {}, source.index("{", head) + 1
    while True:
        m = TOKEN.match(source, i)
        if not m:
            break
        if m.group("comment"):
            i = m.end()
            continue
        key = m.group("key")
        value, i = read_value(source, m.end())
        out[key] = value
        i = re.match(r"\s*,?", source[i:]).end() + i
    return out


def name(key: str) -> str:
    return "web_" + re.sub(r"[^A-Za-z0-9]", "_", key)


def escape(text: str, positions: dict, plural: bool) -> str:
    has_args = bool(PLACEHOLDER.search(text))
    if has_args:
        text = text.replace("%", "%%")

    def arg(m):
        placeholder = m.group(1)
        if placeholder not in positions:
            return m.group(0)
        spec = "d" if plural and placeholder == "count" else "s"
        return f"%{positions[placeholder]}${spec}"

    text = PLACEHOLDER.sub(arg, text)
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = text.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"').replace("\n", "\\n")
    if text.startswith(("@", "?")):
        text = "\\" + text
    return text


def order(english, others) -> dict:
    """Each placeholder's position: the English message's order, then any the others add."""
    seen = []
    for value in [english, *others]:
        texts = value.values() if isinstance(value, dict) else [value]
        for text in texts:
            for placeholder in PLACEHOLDER.findall(text or ""):
                if placeholder not in seen:
                    seen.append(placeholder)
    if isinstance(english, dict) and "count" in seen:
        seen.remove("count")
        seen.insert(0, "count")
    return {p: i + 1 for i, p in enumerate(seen)}


def main() -> None:
    for area in AREAS:
        catalogs = {lang: messages(LOCALES / lang / f"{area}.ts") for lang in LANGUAGES}
        english = catalogs["en"]
        for lang, folder in LANGUAGES.items():
            lines = [
                '<?xml version="1.0" encoding="utf-8"?>',
                f"<!-- Made by scripts/web_strings.py from apps/web/src/i18n/locales/{lang}/{area}.ts. Don't edit. -->",
                "<resources>",
            ]
            for key, base in english.items():
                value = catalogs[lang].get(key, base)
                positions = order(base, [catalogs[o].get(key) for o in LANGUAGES if o != "en" and catalogs[o].get(key) is not None])
                if isinstance(base, dict):
                    forms = value if isinstance(value, dict) else base
                    lines.append(f'    <plurals name="{name(key)}">')
                    for quantity in ("zero", "one", "two", "few", "many", "other"):
                        if quantity in forms:
                            lines.append(f'        <item quantity="{quantity}">{escape(forms[quantity], positions, True)}</item>')
                    lines.append("    </plurals>")
                else:
                    text = value if isinstance(value, str) else base
                    lines.append(f'    <string name="{name(key)}">{escape(text, positions, False)}</string>')
            lines.append("</resources>")
            out = RES / folder / f"strings_web_{area.lower()}.xml"
            out.write_text("\n".join(lines) + "\n")
            print(f"{out.relative_to(ROOT)}: {len(english)} messages", file=sys.stderr)


if __name__ == "__main__":
    main()
