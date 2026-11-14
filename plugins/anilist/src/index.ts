/// <reference types="@matinee/plugin/globals" />
import {
  definePlugin,
  fetchJson,
  ProviderError,
  type Json,
  type CreditDetails,
  type ImageCandidate,
  type TitleDetails,
} from "@matinee/plugin"

// Decode the small portion of AniList's JSON that this provider uses.
/* oxlint-disable anti-slop/no-runtime-typeof */
function object(value: Json | undefined): { [key: string]: Json } {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {}
}
function text(value: Json | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}
function number(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
/* oxlint-enable anti-slop/no-runtime-typeof */
function list(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : []
}
function strings(value: Json | undefined): string[] {
  return list(value).flatMap((entry) => text(entry) ?? [])
}
function image(value: Json | undefined): string | null {
  const url = text(value)
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && parsed.hostname === "s4.anilist.co"
      ? url
      : null
  } catch {
    return null
  }
}
function overview(value: Json | undefined): string | null {
  const html = text(value)
  if (!html) return null
  const entities = new Map(
    Object.entries({
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: " ",
      ndash: "–",
      mdash: "—",
      hellip: "…",
      rsquo: "’",
      lsquo: "‘",
      ldquo: "“",
      rdquo: "”",
    }),
  )
  return (
    html
      .replace(/<br\s*\/?\s*>|<\/p\s*>/gi, "\n\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match: string, entity: string) => {
        if (!entity.startsWith("#")) return entities.get(entity) ?? match
        const code = entity.startsWith("#x")
          ? Number.parseInt(entity.slice(2), 16)
          : Number(entity.slice(1))
        return code > 0 &&
          code <= 0x10ffff &&
          !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : match
      })
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() || null
  )
}
const fields = `id idMal title { romaji english native } synonyms startDate { year month day } description genres averageScore status duration coverImage { extraLarge large } bannerImage studios { nodes { name isAnimationStudio } } characters(sort: [ROLE, RELEVANCE, ID], perPage: 25) { edges { role node { name { full } } voiceActors(language: JAPANESE) { id name { full } image { large } } } } staff(perPage: 25, sort: [RELEVANCE, ID]) { edges { role node { id name { full } image { large } } } }`
async function graphql(
  query: string,
  variables: Json,
): Promise<{ [key: string]: Json }> {
  let result
  try {
    result = object(
      await fetchJson("https://graphql.anilist.co", {
        method: "POST",
        body: { query, variables },
      }),
    )
  } catch (cause) {
    if (cause instanceof ProviderError) throw cause
    throw new ProviderError("Cannot reach AniList. Try again later.")
  }
  if (list(result.errors).length)
    throw new ProviderError(
      "AniList could not complete the query. Check the title ID or try again later.",
    )
  if (!result.data)
    throw new ProviderError("AniList returned no data. Try again later.")
  return object(result.data)
}
async function media(variables: Json) {
  const data = await graphql(
    `query($id:Int,$idMal:Int) { Media(id:$id,idMal:$idMal,type:ANIME) { ${fields} } }`,
    variables,
  )
  const result = object(data.Media)
  if (number(result.id) === null)
    throw new ProviderError("AniList did not return a valid anime title.")
  return result
}
function idNumber(id: string): number {
  const value = Number(id)
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(value) || value <= 0)
    throw new ProviderError("Use a positive numeric AniList or MyAnimeList ID.")
  return value
}
export default definePlugin((ctx) => {
  function name(item: { [key: string]: Json }): string {
    const titles = object(item.title)
    const title =
      text(titles[String(ctx.config.titleLanguage ?? "romaji")]) ??
      text(titles.romaji) ??
      text(titles.english) ??
      text(titles.native)
    if (!title)
      throw new ProviderError("AniList returned a title without a name.")
    return title
  }
  function images(item: { [key: string]: Json }): TitleDetails["images"] {
    return {
      poster:
        image(object(item.coverImage).extraLarge) ??
        image(object(item.coverImage).large),
      backdrop: image(item.bannerImage),
      logo: null,
    }
  }
  return {
    metadata: {
      anilist: {
        async search(query) {
          // Folder years are hints for the host's ranking, never AniList filters.
          const data = await graphql(
            `
              query (
                $search: String
                $formats: [MediaFormat]
                $adult: Boolean
              ) {
                Page(page: 1, perPage: 25) {
                  media(
                    search: $search
                    type: ANIME
                    format_in: $formats
                    isAdult: $adult
                  ) {
                    id
                    title {
                      romaji
                      english
                      native
                    }
                    synonyms
                    startDate {
                      year
                    }
                    description
                    coverImage {
                      extraLarge
                      large
                    }
                  }
                }
              }
            `,
            {
              search: query.name,
              formats:
                query.kind === "movie"
                  ? ["MOVIE"]
                  : ["TV", "TV_SHORT", "ONA", "OVA", "SPECIAL"],
              adult: ctx.config.adult === true,
            },
          )
          return list(object(data.Page).media).map((entry) => {
            const item = object(entry)
            const id = number(item.id)
            if (id === null)
              throw new ProviderError(
                "AniList returned a search result without an ID.",
              )
            const title = name(item)
            return {
              id: String(id),
              name: title,
              aliases: [
                ...new Set([
                  ...Object.values(object(item.title)).flatMap(
                    (value) => text(value) ?? [],
                  ),
                  ...strings(item.synonyms),
                ]),
              ].filter((alias) => alias !== title),
              year: number(object(item.startDate).year),
              overview: overview(item.description),
              poster: images(item).poster,
            }
          })
        },
        async lookup(ids) {
          if (ids.anilist) return ids.anilist
          if (!ids.mal) return null
          return String((await media({ idMal: idNumber(ids.mal) })).id)
        },
        async details(id): Promise<TitleDetails> {
          const item = await media({ id: idNumber(id) })
          const date = object(item.startDate)
          const year = number(date.year)
          const month = number(date.month)
          const day = number(date.day)
          const credits: CreditDetails[] = []
          for (const raw of list(object(item.characters).edges)) {
            const edge = object(raw)
            if (edge.role !== "MAIN" && edge.role !== "SUPPORTING") continue
            for (const actor of list(edge.voiceActors)) {
              const person = object(actor)
              const actorName = text(object(person.name).full)
              if (actorName)
                credits.push({
                  kind: "actor",
                  name: actorName,
                  role: text(object(object(edge.node).name).full),
                  personId:
                    number(person.id) === null ? null : String(person.id),
                  photo: image(object(person.image).large),
                })
            }
          }
          for (const raw of list(object(item.staff).edges)) {
            const edge = object(raw)
            const role = text(edge.role) ?? ""
            const kind =
              role === "Director"
                ? "director"
                : /^Original (Creator|Story|Work)$/i.test(role)
                  ? "creator"
                  : null
            const person = object(edge.node)
            const staffName = text(object(person.name).full)
            if (kind && staffName)
              credits.push({
                kind,
                name: staffName,
                role,
                personId: number(person.id) === null ? null : String(person.id),
                photo: image(object(person.image).large),
              })
          }
          const statuses = new Map(
            Object.entries({
              FINISHED: "Finished",
              RELEASING: "Releasing",
              NOT_YET_RELEASED: "Not yet released",
              CANCELLED: "Cancelled",
              HIATUS: "On hiatus",
            }),
          )
          return {
            id: String(item.id),
            name: name(item),
            originalName: text(object(item.title).native),
            originalLanguage: null,
            year,
            overview: overview(item.description),
            tagline: null,
            genres: strings(item.genres),
            rating:
              number(item.averageScore) === null
                ? null
                : Math.min(100, Math.max(0, Number(item.averageScore))) / 10,
            contentRating: null,
            releaseDate:
              year && month && day
                ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                : null,
            status: statuses.get(text(item.status) ?? "") ?? null,
            runtimeMinutes: number(item.duration),
            externalIds:
              number(item.idMal) === null ? {} : { mal: String(item.idMal) },
            images: images(item),
            studios: list(object(item.studios).nodes)
              .map(object)
              .sort(
                (a, b) =>
                  Number(b.isAnimationStudio === true) -
                  Number(a.isAnimationStudio === true),
              )
              .flatMap((studio) => text(studio.name) ?? []),
            credits,
            seasons: [],
            episodes: [],
          }
        },
        async images(id, _lookup, scope) {
          if (scope.kind !== "title") return []
          const artwork = images(await media({ id: idNumber(id) }))
          const candidates: ImageCandidate[] = []
          for (const slot of ["poster", "backdrop"] as const)
            if (artwork[slot])
              candidates.push({
                slot,
                url: artwork[slot],
                preview: null,
                width: null,
                height: null,
                language: null,
                score: 0,
                votes: 0,
              })
          return candidates
        },
      },
    },
  }
})
