import { t } from "./schema"
import { Facet, PersonSummary, TitleSummary } from "./titles"
import { ProfileUser } from "./users"

/** A search across the server. `limit` caps each kind of result. */
export const SearchInput = t.object({
  query: t.string().trim().min(1).max(200, "Use at most 200 characters."),
  limit: t.number().int().min(1).max(100).$default(20),
  /**
   * Keys from `GENRES`, comma separated, whose names in the client's
   * language match the query. Genres are stored by key, so the server
   * finds those as well as the keys and names that contain the query.
   */
  genres: t.string().max(2000).optional(),
})
export type SearchInput = t.infer<typeof SearchInput>

/**
 * What a search found, a list per kind, best matches first: names that
 * start with the query, then the rest. A new kind of result gets its own
 * list here.
 */
export const SearchResults = t.object({
  /** Accounts on the server, by username or display name. */
  users: t.array(ProfileUser),
  /** Movies and shows in every library, by name or original name. */
  titles: t.array(TitleSummary),
  /**
   * Cast and crew of those titles, by name. Among equal matches, people
   * with more titles come first.
   */
  people: t.array(PersonSummary),
  genres: t.array(Facet),
  studios: t.array(Facet),
})
export type SearchResults = t.infer<typeof SearchResults>
