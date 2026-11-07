import type {
  Facet,
  Library,
  PersonSummary,
  ProfileUser,
  SearchResults,
  TitleSummary,
} from "@matinee/contracts"

/**
 * One thing a search found. A new kind of result is a new member here, a
 * section in `searchSections`, and a row in each place that shows them.
 */
export type SearchHit =
  | { kind: "user"; id: string; user: ProfileUser }
  | { kind: "title"; id: string; title: TitleSummary }
  | { kind: "person"; id: string; person: PersonSummary }
  | { kind: "genre"; id: string; facet: Facet }
  | { kind: "studio"; id: string; facet: Facet }

export type SearchSection = {
  key: string
  label: string
  /** What the section holds, for its icon and layout. */
  kind: "profiles" | "cast" | "genres" | "studios" | Library["kind"]
  hits: SearchHit[]
}

/** A hit's name, as screen readers and the field read it. */
export function hitName(hit: SearchHit): string {
  switch (hit.kind) {
    case "user":
      return hit.user.displayName ?? hit.user.username
    case "title":
      return hit.title.name
    case "person":
      return hit.person.name
    case "genre":
    case "studio":
      return hit.facet.name
  }
}

/**
 * The results as sections: profiles, each library in the bar's order, cast
 * and crew, genres, then studios. Sections with nothing in them are left
 * out. `perSection` caps each, for the spotlight's short list.
 */
export function searchSections(
  results: SearchResults,
  libraries: Library[],
  perSection = Infinity,
): SearchSection[] {
  const sections: SearchSection[] = [
    {
      key: "profiles",
      label: "Profiles",
      kind: "profiles",
      hits: results.users.map((user) => ({ kind: "user", id: user.id, user })),
    },
    ...libraries.map((library): SearchSection => ({
      key: library.id,
      label: library.name,
      kind: library.kind,
      hits: results.titles
        .filter((title) => title.libraryId === library.id)
        .map((title) => ({ kind: "title", id: title.id, title })),
    })),
    {
      key: "cast",
      label: "Cast & crew",
      kind: "cast",
      hits: results.people.map((person) => ({
        kind: "person",
        id: `person:${person.name}`,
        person,
      })),
    },
    {
      key: "genres",
      label: "Genres",
      kind: "genres",
      hits: results.genres.map((facet) => ({
        kind: "genre",
        id: `genre:${facet.name}`,
        facet,
      })),
    },
    {
      key: "studios",
      label: "Studios",
      kind: "studios",
      hits: results.studios.map((facet) => ({
        kind: "studio",
        id: `studio:${facet.name}`,
        facet,
      })),
    },
  ]
  return sections
    .map((section) => ({ ...section, hits: section.hits.slice(0, perSection) }))
    .filter((section) => section.hits.length > 0)
}
