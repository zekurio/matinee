import { CatalogTitleSummary } from "./catalog"
import { t } from "./schema"
import { PersonCredit, PersonSummary } from "./titles"

/** TMDB's departments, for what someone is known for. */
export const PERSON_DEPARTMENTS = [
  "acting",
  "directing",
  "writing",
  "creator",
  "production",
  "editing",
  "camera",
  "sound",
  "art",
  "costume",
  "visualEffects",
  "lighting",
  "crew",
] as const
export const PersonDepartment = t.enum(PERSON_DEPARTMENTS)
export type PersonDepartment = t.infer<typeof PersonDepartment>

/** What TMDB says about someone. */
export const PersonProfile = t.object({
  tmdbId: t.string(),
  /** Null for a department TMDB adds later. */
  knownFor: PersonDepartment.nullable(),
  /** `YYYY-MM-DD`. */
  birthday: t.string().nullable(),
  deathday: t.string().nullable(),
  /** In the page's language, else in English. */
  biography: t.string().nullable(),
})
export type PersonProfile = t.infer<typeof PersonProfile>

/** A title of theirs at TMDB that no library the viewer sees has. */
export const PersonCatalogCredit = CatalogTitleSummary.extend({
  /** Their parts, then their jobs, as in `PersonCredit.role`. */
  role: t.string().nullable(),
})
export type PersonCatalogCredit = t.infer<typeof PersonCatalogCredit>

export const PersonInput = t.object({
  name: t.string().trim().min(1).max(200),
  /** The person at TMDB, from a credit's `tmdbId`. */
  tmdbId: t
    .string()
    .regex(/^[1-9][0-9]{0,11}$/)
    .optional(),
})

/**
 * Someone, and everything they're in. Without a `tmdbId` the server
 * looks them up at TMDB by name, and takes a match only if it shares a
 * title with their credits here.
 */
export const Person = PersonSummary.extend({
  /** In the libraries, newest first. */
  credits: t.array(PersonCredit),
  /**
   * Null without a match at TMDB, without a TMDB key, or for a viewer
   * with nowhere to request into.
   */
  profile: PersonProfile.nullable(),
  /**
   * Their other titles at TMDB, cast and crew, of the kinds the viewer
   * can request, newest first. Each title once, and none of `credits`',
   * nor adult or declined ones.
   */
  catalog: t.array(PersonCatalogCredit),
  /** TMDB's answer is from an expired cache entry. */
  stale: t.boolean(),
})
export type Person = t.infer<typeof Person>
