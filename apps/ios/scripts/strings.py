#!/usr/bin/env python3
"""Turn the Android app's strings into the iOS app's string catalog.

Android's res/values*/strings*.xml are the source for every word the two
apps share, so the apps read alike and a translation is made once. This
writes, git-ignored,

  Matinee/Resources/Localizable.xcstrings   every string and plural, English
                                            and German, under Android's keys
  Matinee/UI/Strings.gen.swift              `Str`, one typed accessor per key

XcodeGen runs it before it generates the project, as project.yml's
preGenCommand, so `just generate` and every build pick up a changed string.

Strings only iOS needs go by hand in Matinee/Resources/iOS.xcstrings, in
Xcode's format and with iOS's format specifiers (%@, %lld). They get
accessors in `Str` too; a key may not be in both.

An Android key becomes an accessor in lower camel case:
`R.string.home_continue_watching` is `Str.homeContinueWatching`, and one
with arguments is a function, typed by its format specifiers: `%1$s` takes a
String, `%1$d` an Int. Usually a plural's first argument is its count:
`R.plurals.media_episode_count` is `Str.mediaEpisodeCount(_ count: Int)`.
For web_requests_scope_seasons Android formats a season range as %1$s;
its accessor takes that String followed by a separate Int count.
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT.parent / "android/app/src/main/res"
CATALOG = ROOT / "Matinee/Resources/Localizable.xcstrings"
IOS_CATALOG = ROOT / "Matinee/Resources/iOS.xcstrings"
ACCESSORS = ROOT / "Matinee/UI/Strings.gen.swift"

SOURCE = "en"
# The app's languages: English in values/, the rest in values-<lang>/.
LANGUAGES = {"en": "values", "de": "values-de"}

ANDROID_SPEC = re.compile(r"%(?:(\d+)\$)?([-#+ 0,(]*)(\d+)?(?:\.(\d+))?([sdfx%])")
IOS_SPEC = re.compile(r"%(?:(\d+)\$)?([-#+ 0]*)(\d+)?(?:\.(\d+))?(@|lld|ld|d|f|%)")
SWIFT_TYPES = {"s": "String", "d": "Int", "x": "Int", "f": "Double"}
IOS_TYPES = {"@": "String", "lld": "Int", "ld": "Int", "d": "Int", "f": "Double"}
KEYWORDS = {"default", "import", "in", "is", "as", "case", "class", "continue", "return", "self", "switch", "where"}


def fail(message: str) -> None:
    sys.exit(f"strings.py: {message}")


def android_text(element: ET.Element) -> str:
    """A string resource's text as Android shows it: quotes, escapes, and whitespace resolved."""
    raw = "".join(element.itertext())
    out = []
    quoted = False
    i = 0
    while i < len(raw):
        char = raw[i]
        if char == "\\" and i + 1 < len(raw):
            following = raw[i + 1]
            if following == "u":
                out.append(chr(int(raw[i + 2 : i + 6], 16)))
                i += 6
                continue
            out.append({"n": "\n", "t": "\t"}.get(following, following))
            i += 2
            continue
        if char == '"':
            quoted = not quoted
            i += 1
            continue
        if not quoted and char.isspace():
            # Android folds runs of whitespace outside quotes into one space.
            if out and out[-1] != " ":
                out.append(" ")
            i += 1
            continue
        out.append(char)
        i += 1
    return "".join(out).strip(" ")


def convert(text: str, where: str) -> tuple[str, dict[int, str]]:
    """Android's format specifiers as iOS's, with the type of each argument by position."""
    args: dict[int, str] = {}
    implicit = 0

    def replace(match: re.Match) -> str:
        nonlocal implicit
        position, flags, width, precision, kind = match.groups()
        if kind == "%":
            return "%%"
        if position is None:
            implicit += 1
            number = implicit
        else:
            number = int(position)
        swift = SWIFT_TYPES[kind]
        if args.get(number, swift) != swift:
            fail(f"{where}: argument {number} is used as two types")
        args[number] = swift
        spec = {"s": "@", "d": "lld", "x": "llx", "f": "f"}[kind]
        return f"%{number}${flags or ''}{width or ''}{'.' + precision if precision else ''}{spec}"

    return ANDROID_SPEC.sub(replace, text), args


def ios_args(text: str) -> dict[int, str]:
    args: dict[int, str] = {}
    implicit = 0
    for position, _, _, _, kind in IOS_SPEC.findall(text):
        if kind == "%":
            continue
        if position:
            number = int(position)
        else:
            implicit += 1
            number = implicit
        args[number] = IOS_TYPES[kind]
    return args


def read_language(folder: str) -> dict[str, dict]:
    """Every string and plural in one values folder, by key."""
    entries: dict[str, dict] = {}
    for path in sorted((RES / folder).glob("strings*.xml")):
        for element in ET.parse(path).getroot():
            name = element.get("name")
            if name is None:
                continue
            where = f"{folder}/{path.name}: {name}"
            if name in entries:
                fail(f"{where} is defined twice")
            translatable = element.get("translatable") != "false"
            if element.tag == "string":
                value, args = convert(android_text(element), where)
                entries[name] = {"value": value, "args": args, "translatable": translatable}
            elif element.tag == "plurals":
                forms = {}
                args: dict[int, str] = {}
                for item in element.findall("item"):
                    value, item_args = convert(android_text(item), where)
                    forms[item.get("quantity")] = value
                    args.update(item_args)
                if "other" not in forms:
                    fail(f"{where} has no 'other' form")
                # Admin.kt passes seasonRuns(numbers), not the quantity, as %1$s.
                # Keep the formatting argument and add a separate plural selector.
                count_arg = max(args, default=0) + 1 if name == "web_requests_scope_seasons" else 1
                if args.get(count_arg, "Int") != "Int":
                    fail(f"{where}: plural count argument is not an integer")
                args[count_arg] = "Int"
                entries[name] = {"plural": forms, "args": args, "count_arg": count_arg, "translatable": translatable}
            elif element.tag == "string-array":
                fail(f"{where}: string arrays aren't supported; use a string per item")
    return entries


def unit(value: str) -> dict:
    return {"stringUnit": {"state": "translated", "value": value}}


def localization(entry: dict) -> dict:
    if "plural" not in entry:
        return unit(entry["value"])
    forms = {quantity: unit(text) for quantity, text in entry["plural"].items()}
    count_arg = entry.get("count_arg", 1)
    if count_arg == 1 and any("%1$" in text for text in entry["plural"].values()):
        # The count is the first argument. The plural varies the whole
        # string, so the other arguments can sit anywhere in each form.
        return {"variations": {"plural": forms}}
    # A plural that doesn't show its count, like "Director" and "Directors":
    # Xcode only takes that as a substitution of the count.
    return {
        "stringUnit": {"state": "translated", "value": "%#@count@" if count_arg == 1 else f"%{count_arg}$#@count@"},
        "substitutions": {"count": {"argNum": count_arg, "formatSpecifier": "lld", "variations": {"plural": forms}}},
    }


def catalog(languages: dict[str, dict[str, dict]]) -> str:
    source = languages[SOURCE]
    strings = {}
    for key in sorted(source):
        entry = source[key]
        record: dict = {"extractionState": "manual", "localizations": {SOURCE: localization(entry)}}
        if not entry["translatable"]:
            record["shouldTranslate"] = False
        for language, entries in languages.items():
            if language == SOURCE:
                continue
            if not entry["translatable"]:
                # The same in every language, like the app's name; without a
                # copy, a lookup in another language gets the key back.
                record["localizations"][language] = localization(entry)
                continue
            translated = entries.get(key)
            if translated is None:
                continue
            if translated["args"] != entry["args"]:
                fail(f"{language}: {key} takes other arguments than in English")
            if ("plural" in translated) != ("plural" in entry):
                fail(f"{language}: {key} is a plural in one language only")
            record["localizations"][language] = localization(translated)
        strings[key] = record
    for language, entries in languages.items():
        for key in entries:
            if key not in source:
                fail(f"{language}: {key} isn't in English")
    document = {"sourceLanguage": SOURCE, "strings": strings, "version": "1.0"}
    # As Xcode writes catalogs, so opening one in Xcode changes nothing.
    return json.dumps(document, indent=2, ensure_ascii=False, sort_keys=True, separators=(",", " : ")) + "\n"


def read_ios() -> dict[str, dict]:
    """The hand-written catalog's strings, typed by their iOS specifiers."""
    if not IOS_CATALOG.exists():
        return {}
    document = json.loads(IOS_CATALOG.read_text())
    entries = {}
    for key, record in document.get("strings", {}).items():
        english = record.get("localizations", {}).get(SOURCE)
        if english is None:
            fail(f"iOS.xcstrings: {key} has no English")
        plural = english.get("variations", {}).get("plural")
        if plural is not None:
            forms = {quantity: form["stringUnit"]["value"] for quantity, form in plural.items()}
            args: dict[int, str] = {}
            for text in forms.values():
                args.update(ios_args(text))
            args[1] = "Int"
            entries[key] = {"plural": forms, "args": args}
        else:
            value = english["stringUnit"]["value"]
            entries[key] = {"value": value, "args": ios_args(value)}
    return entries


def swift_name(key: str) -> str:
    parts = [part for part in key.split("_") if part]
    name = parts[0][0].lower() + parts[0][1:] + "".join(part[0].upper() + part[1:] for part in parts[1:])
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
        fail(f"{key} doesn't make a Swift name")
    return f"`{name}`" if name in KEYWORDS else name


def doc(entry: dict) -> str:
    text = entry["value"] if "plural" not in entry else " / ".join(entry["plural"].values())
    return text.replace("\n", "\\n")


def accessor(key: str, entry: dict, table: str) -> str:
    name = swift_name(key)
    args = entry["args"]
    count = max(args) if args else 0
    for number in range(1, count + 1):
        if number not in args:
            fail(f"{key} skips argument {number}")
    table_arg = "" if table == "Localizable" else f', table: "{table}"'
    lines = [f"  /// {doc(entry)}"]
    if count == 0:
        lines.append(f'  static var {name}: String {{ tr("{key}"{table_arg}) }}')
        return "\n".join(lines)
    params = []
    values = []
    for number in range(1, count + 1):
        label = "count" if "plural" in entry and number == entry.get("count_arg", 1) else f"p{number}"
        params.append(f"_ {label}: {args[number]}")
        values.append(label)
    lines.append(
        f"  static func {name}({', '.join(params)}) -> String {{ "
        f'tr("{key}"{table_arg}, {", ".join(values)}) }}'
    )
    return "\n".join(lines)


def accessors(shared: dict[str, dict], ios: dict[str, dict]) -> str:
    names: dict[str, str] = {}
    body = []
    for table, entries in (("Localizable", shared), ("iOS", ios)):
        for key in sorted(entries):
            name = swift_name(key)
            if name in names:
                fail(f"{key} and {names[name]} make the same accessor, {name}")
            names[name] = key
            body.append(accessor(key, entries[key], table))
    return (
        "// Generated by scripts/strings.py from Android's res/values*/strings*.xml and\n"
        "// Resources/iOS.xcstrings. Don't edit; change those and run it again.\n"
        "import Foundation\n"
        "\n"
        "/// The app's words in its language, one accessor per key of the catalogs:\n"
        "/// Android's `R.string.home_continue_watching` is `Str.homeContinueWatching`,\n"
        "/// and a string with arguments or a plural is a function of them.\n"
        "nonisolated enum Str {\n"
        + "\n".join(body)
        + "\n}\n"
        "\n"
        "nonisolated private func tr(_ key: String, table: String = \"Localizable\") -> String {\n"
        "  Bundle.main.localizedString(forKey: key, value: nil, table: table)\n"
        "}\n"
        "\n"
        "/// A string with arguments, formatted in the app's language (`Locale.app`,\n"
        "/// in Format.swift). A plural's format carries its forms, which\n"
        "/// formatting picks from by the count.\n"
        "nonisolated private func tr(_ key: String, table: String = \"Localizable\", _ args: any CVarArg...) -> String {\n"
        "  let format = Bundle.main.localizedString(forKey: key, value: nil, table: table)\n"
        "  return String(format: format, locale: Locale.app, arguments: args)\n"
        "}\n"
    )


def main() -> None:
    languages = {language: read_language(folder) for language, folder in LANGUAGES.items()}
    ios = read_ios()
    for key in ios:
        if key in languages[SOURCE]:
            fail(f"iOS.xcstrings: {key} is one of Android's strings already")
    outputs = {CATALOG: catalog(languages), ACCESSORS: accessors(languages[SOURCE], ios)}
    for path, text in outputs.items():
        # Left alone when it's the same, so Xcode doesn't rebuild for nothing.
        if not path.exists() or path.read_text() != text:
            path.write_text(text)


if __name__ == "__main__":
    main()
