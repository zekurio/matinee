import { type AnyColumn, type SQL, ilike, or, sql } from "drizzle-orm"

/** `value` as literal text in a LIKE pattern: its wildcards don't match. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/**
 * `value` without spaces and ASCII punctuation, so "Full Metal" and
 * "Fullmetal", or "Alchemist Brotherhood" and "Alchemist: Brotherhood",
 * read the same. Letters in any script stay. What's left holds no LIKE
 * wildcards.
 */
function compact(value: string): string {
  return value.replace(/[\t\n\v\f\r !-/:-@[-`{-~]+/g, "")
}

/**
 * `column` with the same characters taken out in Postgres. Spelled as
 * classes that mean ASCII whatever the database's locale, unlike
 * `[:alnum:]`, which drops other scripts under the C locale.
 */
function compacted(column: AnyColumn): SQL {
  return sql`regexp_replace(${column}, '[[:space:][:punct:]]+', '', 'g')`
}

/**
 * Whether `column` holds `query`, ignoring case, spaces, and punctuation.
 * A query of only punctuation matches as written.
 */
export function looselyContains(column: AnyColumn, query: string): SQL {
  const plain = ilike(column, `%${escapeLike(query)}%`)
  const letters = compact(query)
  if (!letters) return plain
  return or(plain, sql`${compacted(column)} ilike ${`%${letters}%`}`) ?? plain
}

/** Whether `column` starts with `query`, by the same rules. */
export function looselyStartsWith(column: AnyColumn, query: string): SQL {
  const plain = ilike(column, `${escapeLike(query)}%`)
  const letters = compact(query)
  if (!letters) return plain
  return or(plain, sql`${compacted(column)} ilike ${`${letters}%`}`) ?? plain
}
