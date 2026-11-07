import { type CreditDetails, MAX_CAST, mergeCrew, text } from "../types"
import { image } from "./client"
import type { AggregateCastMember, CrewMember, Person, Show } from "./payloads"

// Credits for the source a title adapts. A show lists them however few
// episodes they cover.
const SOURCE_JOBS = [
  "Novel",
  "Short Story",
  "Original Story",
  "Comic Book",
  "Author",
]
// Writing credits worth showing, most direct first. Jellyfin keeps the
// first three; source material counts too, since adaptations are common.
const WRITER_JOBS = [
  "Screenplay",
  "Writer",
  "Teleplay",
  "Story",
  ...SOURCE_JOBS,
]
// Anime credits one director and one head writer for the whole series.
const SERIES_JOBS = ["Series Director", "Series Composition"]
const MAX_CREW = 10

export function credit(
  person: Person,
  kind: CreditDetails["kind"],
  role: string | null | undefined,
): CreditDetails | null {
  const name = text(person.name)
  if (!name) return null
  return {
    kind,
    name,
    // TMDB marks voice parts; TheTVDB doesn't, and in an animated cast
    // every part would say it.
    role: text(role?.replace(/\s*\(voice\)$/i, "")),
    personId: String(person.id),
    photo: image(person.profile_path, "h632"),
  }
}

export function billed<T extends { order?: number }>(
  cast: T[] | undefined,
): T[] {
  return [...(cast ?? [])]
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
    .slice(0, MAX_CAST)
}

/** Directors, then writers by how directly they wrote it. */
export function movieCrew(crew: CrewMember[] | undefined): CreditDetails[] {
  const rank = (member: CrewMember) =>
    member.job === "Director" ? -1 : WRITER_JOBS.indexOf(member.job ?? "")
  const wanted = (crew ?? [])
    .filter((member) =>
      member.department === "Directing"
        ? member.job === "Director"
        : member.department === "Writing" && rank(member) >= 0,
    )
    .sort((a, b) => rank(a) - rank(b))
    .map((member) =>
      credit(
        member,
        member.job === "Director" ? "director" : "writer",
        member.job,
      ),
    )
    .filter((member) => member !== null)
  return mergeCrew(wanted).slice(0, MAX_CREW)
}

/** Each actor as the character they played in the most episodes. */
export function showCast(
  cast: AggregateCastMember[] | undefined,
): CreditDetails[] {
  return billed(cast)
    .map((member) => {
      const role = [...(member.roles ?? [])].sort(
        (a, b) => (b.episode_count ?? 0) - (a.episode_count ?? 0),
      )[0]
      return credit(member, "actor", role?.character)
    })
    .filter((member) => member !== null)
}

/**
 * The creators, then the people who directed or wrote the show as a whole:
 * anime's series director and head writer, anyone who directed or wrote a
 * third of the episodes, and the author of the source. Each episode's own
 * director and writer are left out, and creators who also wrote are named
 * once, as creators.
 */
export function showCrew(show: Show): CreditDetails[] {
  const creators = (show.created_by ?? [])
    .map((person) => credit(person, "creator", null))
    .filter((person) => person !== null)
  const created = new Set(creators.map((person) => person.personId))
  const total = show.number_of_episodes ?? 0
  const order = [...SERIES_JOBS, "Director", ...WRITER_JOBS]
  const crew = (show.aggregate_credits?.crew ?? [])
    .flatMap((member) =>
      (member.jobs ?? []).flatMap(({ job = "", episode_count = 0 }) => {
        const regular = total > 0 && episode_count * 3 >= total
        const kind: CreditDetails["kind"] | null =
          member.department === "Directing"
            ? job === "Series Director" || (job === "Director" && regular)
              ? "director"
              : null
            : member.department === "Writing" &&
                !created.has(String(member.id)) &&
                (job === "Series Composition" ||
                  SOURCE_JOBS.includes(job) ||
                  (WRITER_JOBS.includes(job) && regular))
              ? "writer"
              : null
        return kind ? [{ member, job, kind, episodes: episode_count }] : []
      }),
    )
    .sort(
      (a, b) =>
        Number(a.kind === "writer") - Number(b.kind === "writer") ||
        order.indexOf(a.job) - order.indexOf(b.job) ||
        b.episodes - a.episodes,
    )
    .map((entry) => credit(entry.member, entry.kind, entry.job))
    .filter((member) => member !== null)
  return [...mergeCrew(creators), ...mergeCrew(crew).slice(0, MAX_CREW)]
}
