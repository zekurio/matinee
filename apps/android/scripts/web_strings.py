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
first. The `server` and `validation` areas also become api/ServerMessages.kt, the
English text the app matches to translate server errors (api/ServerText.kt,
the web's `translateKnown()`). Run it again after the web's messages change:

    scripts/web_strings.py
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ROOT.parent / "web/src/i18n/locales"
RES = ROOT / "app/src/main/res"

AREAS = ["appearance", "ask", "branding", "catalog", "common", "discover", "filters", "jobs", "libraries", "metadata", "oidc", "requests", "server", "transcoding", "trickplay", "users", "validation"]
# The app's languages: English in values/, the rest in values-<lang>/.
LANGUAGES = {"en": "values", "de": "values-de"}
# Areas whose English text the app matches, as the web's translateKnown() does.
MATCHED_AREAS = ["server", "validation"]
KOTLIN_OUT = ROOT / "app/src/main/java/io/github/zekurio/matinee/api/ServerMessages.kt"

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


def english_form(base) -> str:
    """The text the web matches: a plural's one form, which English picks for a count of 1."""
    if isinstance(base, dict):
        return base["one"] if "one" in base else base["other"]
    return base


def kotlin_string(text: str) -> str:
    """A Kotlin string literal. `$` is escaped so Kotlin doesn't read a template."""
    body = text.replace("\\", "\\\\").replace('"', '\\"').replace("$", "\\$").replace("\n", "\\n")
    return f'"{body}"'


def kotlin_list(items: list[str]) -> str:
    if not items:
        return "emptyList()"
    return f"listOf({', '.join(kotlin_string(item) for item in items)})"


def kotlin_entry(key: str, base, others: list) -> list[str]:
    """One ServerMessage: the English text, its placeholders, and the positional args of its resource."""
    plural = isinstance(base, dict)
    text = english_form(base)
    names = PLACEHOLDER.findall(text)
    positions = order(base, others)
    args = sorted(positions, key=positions.get)
    for arg in args:
        if arg in names or (plural and arg == "count" and not names):
            continue
        raise ValueError(f"{key}: the translations use the placeholder {arg!r}, which the English message doesn't have")
    return [
        "    ServerMessage(",
        f"        text = {kotlin_string(text)},",
        f"        names = {kotlin_list(names)},",
        f"        args = {kotlin_list(args)},",
        f"        resId = R.{'plurals' if plural else 'string'}.{name(key)},",
        f"        plural = {'true' if plural else 'false'},",
        "    ),",
    ]


def kotlin_file(entries: list[list[str]]) -> str:
    lines = [
        "// Made by scripts/web_strings.py from apps/web/src/i18n/locales/en/server.ts and validation.ts. Don't edit.",
        "package io.github.zekurio.matinee.api",
        "",
        "import io.github.zekurio.matinee.R",
        "",
        "/** The English server and validation messages, in the web's catalog order. See translateServerMessage. */",
        "internal val serverMessages: List<ServerMessage> = listOf(",
        *[line for entry in entries for line in entry],
        ")",
    ]
    return "\n".join(lines) + "\n"


def resource(key: str, base, value, positions: dict) -> list[str]:
    """The XML lines of one message, in a language that may lack it."""
    if not isinstance(base, dict):
        text = value if isinstance(value, str) else base
        return [f'    <string name="{name(key)}">{escape(text, positions, False)}</string>']
    forms = value if isinstance(value, dict) else base
    items = [
        f'        <item quantity="{quantity}">{escape(forms[quantity], positions, True)}</item>'
        for quantity in ("zero", "one", "two", "few", "many", "other")
        if quantity in forms
    ]
    return [f'    <plurals name="{name(key)}">', *items, "    </plurals>"]


def main() -> None:
    kotlin = []
    for area in AREAS:
        catalogs = {lang: messages(LOCALES / lang / f"{area}.ts") for lang in LANGUAGES}
        english = catalogs["en"]
        resource_names = [name(key) for key in english]
        if len(set(resource_names)) != len(resource_names):
            raise ValueError(f"{area}: two keys make the same resource name")
        for lang, folder in LANGUAGES.items():
            lines = [
                '<?xml version="1.0" encoding="utf-8"?>',
                f"<!-- Made by scripts/web_strings.py from apps/web/src/i18n/locales/{lang}/{area}.ts. Don't edit. -->",
                "<resources>",
            ]
            for key, base in english.items():
                others = [catalogs[o].get(key) for o in LANGUAGES if o != "en" and catalogs[o].get(key) is not None]
                lines += resource(key, base, catalogs[lang].get(key, base), order(base, others))
            lines.append("</resources>")
            out = RES / folder / f"strings_web_{area.lower()}.xml"
            out.write_text("\n".join(lines) + "\n")
            print(f"{out.relative_to(ROOT)}: {len(english)} messages", file=sys.stderr)
        if area in MATCHED_AREAS:
            for key, base in english.items():
                others = [catalogs[o].get(key) for o in LANGUAGES if o != "en" and catalogs[o].get(key) is not None]
                kotlin.append(kotlin_entry(key, base, others))
    KOTLIN_OUT.write_text(kotlin_file(kotlin))
    print(f"{KOTLIN_OUT.relative_to(ROOT)}: {len(kotlin)} messages", file=sys.stderr)


if __name__ == "__main__":
    main()
