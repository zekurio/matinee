import { text } from "../types"
import type { BaseRecord, Translations } from "./payloads"

// TVDB speaks ISO 639-2. The rest of Matinee uses two-letter codes.
const LANGUAGES = new Map([
  ["ar", "ara"],
  ["cs", "ces"],
  ["da", "dan"],
  ["de", "deu"],
  ["el", "ell"],
  ["en", "eng"],
  ["es", "spa"],
  ["fi", "fin"],
  ["fr", "fra"],
  ["he", "heb"],
  ["hu", "hun"],
  ["it", "ita"],
  ["ja", "jpn"],
  ["ko", "kor"],
  ["nl", "nld"],
  ["no", "nor"],
  ["pl", "pol"],
  ["pt", "por"],
  ["ru", "rus"],
  ["sv", "swe"],
  ["tr", "tur"],
  ["uk", "ukr"],
  ["zh", "zho"],
])
const COUNTRIES = new Map([
  ["AU", "aus"],
  ["CA", "can"],
  ["DE", "deu"],
  ["ES", "esp"],
  ["FR", "fra"],
  ["GB", "gbr"],
  ["IT", "ita"],
  ["JP", "jpn"],
  ["NL", "nld"],
  ["US", "usa"],
])

export function tvdbLanguage(language: string): string {
  // TVDB files Brazilian Portuguese under "pt" and Portugal's under "por".
  if (language === "pt-BR") return "pt"
  return LANGUAGES.get(language.split("-")[0] ?? "en") ?? "eng"
}

export function translated(
  translations: Translations | undefined,
  lang: string,
) {
  const name = translations?.nameTranslations?.find(
    (t) => t.language === lang,
  )?.name
  const overview =
    translations?.overviewTranslations?.find((t) => t.language === lang)
      ?.overview ??
    translations?.overviewTranslations?.find((t) => t.language === "eng")
      ?.overview
  return { name: text(name), overview: text(overview) }
}

/** TVDB lists a record's languages as comma-joined strings, like "eng,jpn". */
export function hasLanguage(list: string[] | null | undefined, lang: string) {
  return (list ?? []).some((entry) => entry.split(",").includes(lang))
}

export function contentRating(
  ratings: BaseRecord["contentRatings"],
  language: string,
): string | null {
  const region = language.split("-")[1] ?? "US"
  const country = COUNTRIES.get(region) ?? "usa"
  const match =
    ratings?.find((r) => r.country === country) ??
    ratings?.find((r) => r.country === "usa")
  return text(match?.name)
}
