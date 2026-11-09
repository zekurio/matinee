const names = new Intl.DisplayNames(["en"], {
  type: "language",
  fallback: "none",
})

// A language with an optional region: `en`, `eng`, `pt-BR`, `es-419`.
const CODE = /^[a-z]{2,3}(-[a-z]{2}|-\d{3})?$/i
// Codes that name no language in particular.
const NOT_A_LANGUAGE = new Set(["und", "mul", "mis", "zxx"])

/**
 * A BCP 47 tag for a code from a file name or stream tag. `eng`, `en`, and
 * `ENG` all give `en`, and `ger` gives `de`. Null for `und` and for words
 * that aren't language codes.
 */
export function languageTag(code: string): string | null {
  if (!CODE.test(code)) return null
  const [tag] = Intl.getCanonicalLocales(code)
  if (!tag || NOT_A_LANGUAGE.has(tag) || !names.of(tag)) return null
  return tag
}

let byName: Map<string, string> | null = null

/** The tag for a language's English name, like `English` or `german`. */
export function languageFromName(name: string): string | null {
  if (!byName) {
    byName = new Map()
    const letters = "abcdefghijklmnopqrstuvwxyz"
    for (const a of letters) {
      for (const b of letters) {
        const tag = languageTag(a + b)
        const full = tag ? names.of(tag)?.toLowerCase() : undefined
        if (tag && full && !byName.has(full)) byName.set(full, tag)
      }
    }
  }
  return byName.get(name.toLowerCase()) ?? null
}

/** `English`, `Brazilian Portuguese`. Null for an unknown tag. */
export function languageName(tag: string): string | null {
  try {
    return names.of(tag) ?? null
  } catch {
    return null
  }
}

/**
 * What a track menu shows: the language, the language and the track's own
 * title, or the title alone when it already names the language. A track with
 * neither gets `unnamed`, such as "Track 2".
 */
export function trackLabel(
  language: string | null,
  title: string | null,
  unnamed: string,
): string {
  const name = language ? languageName(language) : null
  if (!title) return name ?? unnamed
  if (!name || title.toLowerCase().includes(name.toLowerCase())) return title
  return `${name} (${title})`
}

/*
 * ISO 639-1 codes with their ISO 639-2 code, the terminology one where a
 * language has two: `aaaar` is `aa` and `aar`. From the Library of
 * Congress's list. MP4 tracks name their language with these.
 */
const ISO_639_2 = new Map(
  (
    "aaaar ababk aeave afafr akaka amamh anarg arara asasm avava ayaym " +
    "azaze babak bebel bgbul bibis bmbam bnben bobod brbre bsbos cacat " +
    "ceche chcha cocos crcre csces cuchu cvchv cycym dadan dedeu dvdiv " +
    "dzdzo eeewe elell eneng eoepo esspa etest eueus fafas ffful fifin " +
    "fjfij fofao frfra fyfry gagle gdgla glglg gngrn guguj gvglv hahau " +
    "heheb hihin hohmo hrhrv hthat huhun hyhye hzher iaina idind ieile " +
    "igibo iiiii ikipk ioido isisl itita iuiku jajpn jvjav kakat kgkon " +
    "kikik kjkua kkkaz klkal kmkhm knkan kokor krkau kskas kukur kvkom " +
    "kwcor kykir lalat lbltz lglug lilim lnlin lolao ltlit lulub lvlav " +
    "mgmlg mhmah mimri mkmkd mlmal mnmon mrmar msmsa mtmlt mymya nanau " +
    "nbnob ndnde nenep ngndo nlnld nnnno nonor nrnbl nvnav nynya ococi " +
    "ojoji omorm orori ososs papan pipli plpol pspus ptpor quque rmroh " +
    "rnrun roron rurus rwkin sasan scsrd sdsnd sesme sgsag sisin skslk " +
    "slslv smsmo snsna sosom sqsqi srsrp ssssw stsot susun svswe swswa " +
    "tatam tetel tgtgk ththa titir tktuk tltgl tntsn toton trtur tstso " +
    "tttat twtwi tytah uguig ukukr ururd uzuzb veven vivie vovol wawln " +
    "wowol xhxho yiyid yoyor zazha zhzho zuzul"
  )
    .split(" ")
    .map((pair) => [pair.slice(0, 2), pair.slice(2)]),
)

/**
 * The three-letter ISO 639-2 code for a BCP 47 tag, as MP4 tracks name
 * their language: `en` and `en-GB` give `eng`. Null when it has none.
 */
export function iso639_2(tag: string): string | null {
  const base = tag.split("-")[0]?.toLowerCase() ?? ""
  if (base.length === 3) return base
  return ISO_639_2.get(base) ?? null
}
