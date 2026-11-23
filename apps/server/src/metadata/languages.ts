import type { MetadataLanguageChoice } from "@matinee/contracts"

/**
 * The languages a library's form offers: ones every provider has a fair
 * amount of data in. A client names each from `nameTag`, which keeps the
 * region only where it tells two apart. English is first, where a new
 * library starts when the client's own language isn't here.
 */
export const METADATA_LANGUAGES: readonly MetadataLanguageChoice[] = [
  { code: "en-US", nameTag: "en" },
  { code: "de-DE", nameTag: "de" },
  { code: "fr-FR", nameTag: "fr" },
  { code: "es-ES", nameTag: "es" },
  { code: "it-IT", nameTag: "it" },
  { code: "pt-BR", nameTag: "pt-BR" },
  { code: "nl-NL", nameTag: "nl" },
  { code: "pl-PL", nameTag: "pl" },
  { code: "sv-SE", nameTag: "sv" },
  { code: "ja-JP", nameTag: "ja" },
  { code: "ko-KR", nameTag: "ko" },
  { code: "zh-CN", nameTag: "zh" },
]
